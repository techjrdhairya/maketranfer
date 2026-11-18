import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DeviceApiError,
  DeviceIdentity,
  DeviceSettings,
  LookupResult,
  TransferInfo,
  createSession,
  eventsUrl,
  fetchInbox,
  formatDeviceId,
  lookupDevice,
  postSignal,
  readIdentity,
  registerDevice,
  removeTransferApi,
  respondToTransfer,
  rotateDevice,
  sendTransferViaServer,
  transferDownloadUrl,
  updateDeviceSettings,
  writeIdentity,
} from '../lib/devices';
import {
  FileWriter,
  P2PError,
  P2PFileMeta,
  SignalListener,
  SignalRegistry,
  isP2PSupported,
  receiveFilesP2P,
  sendFilesP2P,
} from '../lib/p2p';
import { removeMyUpload, uploadFile } from '../lib/api';

export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';

export interface DirectRequest {
  id: string; // transfer id (tid)
  fromId: string;
  fromName: string;
  files: P2PFileMeta[];
  totalSize: number;
  receivedAt: number;
}

export interface ReceivedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  fromName: string;
  blobUrl?: string;
  savedToDisk?: boolean;
  receivedAt: number;
}

export interface DirectReceive {
  tid: string;
  fromName: string;
  percent: number;
  status: 'receiving' | 'done' | 'error';
  error?: string;
}

export interface SendJob {
  id: string;
  toId: string;
  toName?: string;
  fileName: string;
  size: number;
  mode: 'direct' | 'server';
  status: 'queued' | 'waiting' | 'connecting' | 'sending' | 'done' | 'error' | 'declined';
  progress: number;
  error?: string;
}

interface DeviceContextValue {
  identity: DeviceIdentity | null;
  settings: DeviceSettings;
  connection: ConnectionState;
  incoming: TransferInfo[];
  outgoing: TransferInfo[];
  requests: DirectRequest[];
  receives: DirectReceive[];
  received: ReceivedFile[];
  sends: SendJob[];
  pendingCount: number;
  enable: () => void;
  refreshInbox: () => Promise<void>;
  lookup: (id: string) => Promise<LookupResult>;
  sendFiles: (toId: string, files: File[]) => Promise<void>;
  respond: (tid: string, action: 'accept' | 'decline', trust?: boolean) => Promise<void>;
  removeTransfer: (tid: string) => Promise<void>;
  downloadTransfer: (tid: string) => Promise<void>;
  updateSettings: (patch: { name?: string; allowAnyone?: boolean; trust?: string; untrust?: string; block?: string; unblock?: string }) => Promise<void>;
  rotateId: () => Promise<void>;
  acceptRequest: (tid: string) => Promise<void>;
  declineRequest: (tid: string) => Promise<void>;
  dismissReceived: (id: string) => void;
  clearFinishedSends: () => void;
}

const DEFAULT_SETTINGS: DeviceSettings = { allowAnyone: true, trusted: [], blocked: [] };
const BIG_FILE_BYTES = 150 * 1024 * 1024;

const DeviceContext = createContext<DeviceContextValue | null>(null);

export const useDevices = (): DeviceContextValue => {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevices must be used inside DeviceProvider');
  return ctx;
};

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState<boolean>(() => !!readIdentity());
  const [identity, setIdentity] = useState<DeviceIdentity | null>(() => readIdentity());
  const [settings, setSettings] = useState<DeviceSettings>(DEFAULT_SETTINGS);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [incoming, setIncoming] = useState<TransferInfo[]>([]);
  const [outgoing, setOutgoing] = useState<TransferInfo[]>([]);
  const [requests, setRequests] = useState<DirectRequest[]>([]);
  const [receives, setReceives] = useState<DirectReceive[]>([]);
  const [received, setReceived] = useState<ReceivedFile[]>([]);
  const [sends, setSends] = useState<SendJob[]>([]);

  const identityRef = useRef<DeviceIdentity | null>(identity);
  const sidRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const listeners = useRef(new Map<string, SignalListener>());
  const requestsRef = useRef<DirectRequest[]>([]);
  requestsRef.current = requests;

  const registry = useRef<SignalRegistry>({
    on: (tid, l) => {
      listeners.current.set(tid, l);
    },
    off: (tid) => {
      listeners.current.delete(tid);
    },
  }).current;

  // ---------- inbox ----------
  const refreshInbox = useCallback(async () => {
    const id = identityRef.current;
    if (!id) return;
    try {
      const data = await fetchInbox(id);
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
      setSettings(data.settings);
      if (data.name !== id.name) {
        const next = { ...id, name: data.name };
        identityRef.current = next;
        setIdentity(next);
        writeIdentity(next);
      }
    } catch (err) {
      if (err instanceof DeviceApiError && err.code === 'BAD_DEVICE') {
        // server lost us: reconnect (re-registers with the same ID)
        void connect();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- live connection ----------
  const handleSignal = useCallback((data: any) => {
    const { from, type, tid, payload } = data || {};
    if (!tid || !from) return;
    const listener = listeners.current.get(tid);
    if (listener) {
      listener(type, payload);
      return;
    }
    if (type === 'request') {
      const files: P2PFileMeta[] = Array.isArray(payload?.files) ? payload.files : [];
      if (!isP2PSupported()) {
        const sid = sidRef.current;
        if (sid) postSignal(sid, from.id, 'decline', tid).catch(() => {});
        return;
      }
      if (requestsRef.current.some((r) => r.id === tid)) return;
      const req: DirectRequest = {
        id: tid,
        fromId: from.id,
        fromName: payload?.fromName || from.name || from.id,
        files,
        totalSize: files.reduce((n, f) => n + (f.size || 0), 0),
        receivedAt: Date.now(),
      };
      setRequests((prev) => [...prev, req]);
    } else if (type === 'cancel') {
      setRequests((prev) => prev.filter((r) => r.id !== tid));
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    const delay = Math.min(30000, 3000 * Math.pow(2, retryRef.current));
    retryRef.current += 1;
    retryTimer.current = setTimeout(() => {
      void connect();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEvents = useCallback(
    (sid: string) => {
      esRef.current?.close();
      const es = new EventSource(eventsUrl(sid));
      esRef.current = es;
      es.addEventListener('hello', () => {
        retryRef.current = 0;
        setConnection('online');
      });
      es.addEventListener('transfer', () => void refreshInbox());
      es.addEventListener('transfer-update', () => void refreshInbox());
      es.addEventListener('signal', (e: MessageEvent) => {
        try {
          handleSignal(JSON.parse(e.data));
        } catch {}
      });
      es.onerror = () => {
        // Session may be gone (server restart): close and reconnect with a fresh one
        es.close();
        if (esRef.current === es) esRef.current = null;
        setConnection('offline');
        scheduleRetry();
      };
    },
    [handleSignal, refreshInbox, scheduleRetry]
  );

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnection('connecting');
    try {
      const { identity: id, settings: s } = await registerDevice();
      identityRef.current = id;
      setIdentity(id);
      setSettings(s);
      const sid = await createSession(id);
      sidRef.current = sid;
      openEvents(sid);
      await refreshInbox();
    } catch (err) {
      console.warn('Device connection failed:', err);
      setConnection('offline');
      scheduleRetry();
    } finally {
      connectingRef.current = false;
    }
  }, [openEvents, refreshInbox, scheduleRetry]);

  useEffect(() => {
    if (!enabled) return;
    void connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [enabled, connect]);

  // Reconnect when the tab comes back; refresh the inbox once in a while
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (!esRef.current) void connect();
      else void refreshInbox();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && esRef.current) void refreshInbox();
    }, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(timer);
    };
  }, [enabled, connect, refreshInbox]);

  const enable = useCallback(() => setEnabled(true), []);

  // ---------- lookup / send ----------
  const lookup = useCallback((id: string) => lookupDevice(id), []);

  const sendFiles = useCallback(
    async (toRaw: string, files: File[]) => {
      const me = identityRef.current;
      if (!me) throw new Error('This device is not connected yet. Please wait a moment and try again.');
      if (files.length === 0) return;
      const toId = formatDeviceId(toRaw);
      if (toId === me.deviceId) throw new Error('That is your own device ID.');
      const info = await lookupDevice(toId);
      if (!info.exists) throw new Error('No device found with that ID.');

      const direct = !!info.online && isP2PSupported() && !!sidRef.current;
      const jobs: SendJob[] = files.map((f) => ({
        id: rid(),
        toId,
        toName: info.name,
        fileName: f.name,
        size: f.size,
        mode: direct ? 'direct' : 'server',
        status: 'queued',
        progress: 0,
      }));
      setSends((prev) => [...jobs, ...prev]);
      const update = (jobId: string, patch: Partial<SendJob>) =>
        setSends((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
      const updateAll = (patch: Partial<SendJob>) => jobs.forEach((j) => update(j.id, patch));

      // 1) Both online: send directly device-to-device
      if (direct) {
        let reachedSending = false;
        const tid = rid();
        try {
          await sendFilesP2P({
            files,
            fromName: me.name,
            tid,
            registry,
            signal: async (type, payload) => {
              await postSignal(sidRef.current!, toId, type, tid, payload);
            },
            onStatus: (s) => {
              if (s === 'sending') reachedSending = true;
              updateAll({ status: s });
            },
            onProgress: (idx, pct) =>
              jobs.forEach((j, i) => update(j.id, { progress: i < idx ? 100 : i === idx ? pct : 0 })),
            isAborted: () => false,
          });
          updateAll({ status: 'done', progress: 100 });
          return;
        } catch (err: any) {
          if (err instanceof P2PError && err.code === 'DECLINED') {
            updateAll({ status: 'declined', error: `${info.name || toId} declined the transfer.` });
            return;
          }
          if (err instanceof DeviceApiError && err.status === 403) {
            updateAll({ status: 'error', error: err.message });
            return;
          }
          if (reachedSending) {
            updateAll({ status: 'error', error: err?.message || 'The direct transfer was interrupted.' });
            return;
          }
          // Direct connection could not be set up: fall back to the server inbox
          updateAll({ mode: 'server', status: 'queued', progress: 0, error: undefined });
        }
      }

      // 2) Receiver offline (or direct failed): upload and deliver to their inbox
      for (let i = 0; i < files.length; i++) {
        const job = jobs[i];
        try {
          update(job.id, { status: 'sending', mode: 'server', progress: 0 });
          const up = await uploadFile(files[i], undefined, (pct) => update(job.id, { progress: Math.round(pct * 0.9) }));
          await sendTransferViaServer(me, toId, up.document.slug, up.managementToken);
          removeMyUpload(up.document.slug); // now owned by the receiver
          update(job.id, { status: 'done', progress: 100 });
        } catch (err: any) {
          update(job.id, { status: 'error', error: err?.message || 'Could not send this file.' });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry]
  );
  // ---------- inbox actions ----------
  const respond = useCallback(
    async (tid: string, action: 'accept' | 'decline', trust = false) => {
      const id = identityRef.current;
      if (!id) return;
      await respondToTransfer(id, tid, action, trust);
      await refreshInbox();
    },
    [refreshInbox]
  );

  const removeTransfer = useCallback(
    async (tid: string) => {
      const id = identityRef.current;
      if (!id) return;
      await removeTransferApi(id, tid);
      setIncoming((prev) => prev.filter((t) => t.id !== tid));
      await refreshInbox();
    },
    [refreshInbox]
  );

  const downloadTransfer = useCallback(async (tid: string) => {
    const id = identityRef.current;
    if (!id) return;
    if (!sidRef.current) sidRef.current = await createSession(id);
    const a = document.createElement('a');
    a.href = transferDownloadUrl(tid, sidRef.current);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => void refreshInbox(), 1500);
  }, [refreshInbox]);

  const updateSettings = useCallback(
    async (patch: { name?: string; allowAnyone?: boolean; trust?: string; untrust?: string; block?: string; unblock?: string }) => {
      const id = identityRef.current;
      if (!id) return;
      const res = await updateDeviceSettings(id, patch);
      setSettings(res.settings);
      if (res.name !== id.name) {
        const next = { ...id, name: res.name };
        identityRef.current = next;
        setIdentity(next);
        writeIdentity(next);
      }
    },
    []
  );

  const rotateId = useCallback(async () => {
    const id = identityRef.current;
    if (!id) return;
    const res = await rotateDevice(id);
    identityRef.current = res.identity;
    setIdentity(res.identity);
    setSettings(res.settings);
    esRef.current?.close();
    esRef.current = null;
    await connect();
  }, [connect]);

  // ---------- direct receive ----------
  const acceptRequest = useCallback(
    async (tid: string) => {
      const req = requestsRef.current.find((r) => r.id === tid);
      const sid = sidRef.current;
      if (!req || !sid) return;

      // One very large file: stream straight to disk when the browser supports it
      let writer: FileWriter | null = null;
      const picker = (window as any).showSaveFilePicker;
      if (req.files.length === 1 && req.files[0].size > BIG_FILE_BYTES && typeof picker === 'function') {
        try {
          const handle = await picker({ suggestedName: req.files[0].name });
          writer = (await handle.createWritable()) as FileWriter;
        } catch {
          return; // the person cancelled the "save as" dialog: keep the request open
        }
      }

      setRequests((prev) => prev.filter((r) => r.id !== tid));
      setReceives((prev) => [...prev, { tid, fromName: req.fromName, percent: 0, status: 'receiving' }]);
      const updateReceive = (patch: Partial<DirectReceive>) =>
        setReceives((prev) => prev.map((r) => (r.tid === tid ? { ...r, ...patch } : r)));

      receiveFilesP2P({
        tid,
        files: req.files,
        registry,
        writer,
        signal: async (type, payload) => {
          await postSignal(sid, req.fromId, type, tid, payload);
        },
        onProgress: (percent) => updateReceive({ percent }),
        onFile: (f) => {
          const entry: ReceivedFile = {
            id: rid(),
            name: f.name,
            size: f.size,
            type: f.type,
            fromName: req.fromName,
            blobUrl: f.blob ? URL.createObjectURL(f.blob) : undefined,
            savedToDisk: f.savedToDisk,
            receivedAt: Date.now(),
          };
          setReceived((prev) => [entry, ...prev]);
        },
        onDone: () => {
          updateReceive({ status: 'done', percent: 100 });
          setTimeout(() => setReceives((prev) => prev.filter((r) => r.tid !== tid)), 8000);
        },
        onError: (err) => {
          updateReceive({ status: 'error', error: err.message });
          setTimeout(() => setReceives((prev) => prev.filter((r) => r.tid !== tid)), 10000);
        },
      });

      try {
        await postSignal(sid, req.fromId, 'accept', tid);
      } catch (err: any) {
        registry.off(tid);
        updateReceive({ status: 'error', error: err?.message || 'The sender is no longer online.' });
      }
    },
    [registry]
  );

  const declineRequest = useCallback(async (tid: string) => {
    const req = requestsRef.current.find((r) => r.id === tid);
    setRequests((prev) => prev.filter((r) => r.id !== tid));
    const sid = sidRef.current;
    if (req && sid) await postSignal(sid, req.fromId, 'decline', tid).catch(() => {});
  }, []);

  const dismissReceived = useCallback((id: string) => {
    setReceived((prev) => {
      const item = prev.find((r) => r.id === id);
      if (item?.blobUrl) URL.revokeObjectURL(item.blobUrl);
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const clearFinishedSends = useCallback(() => {
    setSends((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'waiting' || j.status === 'connecting' || j.status === 'sending'));
  }, []);

  const pendingCount = incoming.filter((t) => t.status === 'pending').length + requests.length;

  const value = useMemo<DeviceContextValue>(
    () => ({
      identity,
      settings,
      connection,
      incoming,
      outgoing,
      requests,
      receives,
      received,
      sends,
      pendingCount,
      enable,
      refreshInbox,
      lookup,
      sendFiles,
      respond,
      removeTransfer,
      downloadTransfer,
      updateSettings,
      rotateId,
      acceptRequest,
      declineRequest,
      dismissReceived,
      clearFinishedSends,
    }),
    [identity, settings, connection, incoming, outgoing, requests, receives, received, sends, pendingCount, enable, refreshInbox, lookup, sendFiles, respond, removeTransfer, downloadTransfer, updateSettings, rotateId, acceptRequest, declineRequest, dismissReceived, clearFinishedSends]
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
};
