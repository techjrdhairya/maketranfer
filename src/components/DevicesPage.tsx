import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Inbox,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useDevices, SendJob } from '../context/DeviceContext';
import { LookupResult, TransferInfo, formatDeviceId, isCompleteDeviceId } from '../lib/devices';
import { getEffectiveBaseUrl } from '../lib/api';
import { formatBytes, formatDate, formatTimeRemaining } from '../lib/format';

interface DevicesPageProps {
  onBack: () => void;
}

const CONNECTION_LABEL: Record<string, { text: string; cls: string }> = {
  online: { text: 'Online', cls: 'bg-emerald-400/20 text-emerald-50 border-emerald-300/40' },
  connecting: { text: 'Connecting…', cls: 'bg-white/15 text-white border-white/30' },
  offline: { text: 'Offline', cls: 'bg-red-400/25 text-red-50 border-red-300/40' },
  idle: { text: 'Starting…', cls: 'bg-white/15 text-white border-white/30' },
};

export const DevicesPage: React.FC<DevicesPageProps> = ({ onBack }) => {
  const dev = useDevices();
  const { identity, settings, connection, connectionError } = dev;

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Start the connection (first visit creates the device ID)
  useEffect(() => {
    dev.enable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- this device ----------
  const baseUrl = getEffectiveBaseUrl(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<'id' | 'link' | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    if (!identity) return;
    QRCode.toDataURL(`${baseUrl}/devices?to=${identity.deviceId}`, { width: 240, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [identity?.deviceId, baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (what: 'id' | 'link') => {
    if (!identity) return;
    navigator.clipboard?.writeText(what === 'id' ? identity.deviceId : `${baseUrl}/devices?to=${identity.deviceId}`);
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!name || name === identity?.name) return;
    try {
      await dev.updateSettings({ name });
      showToast('ok', 'Device name updated.');
    } catch (e: any) {
      showToast('err', e?.message || 'Could not rename the device.');
    }
  };

  // ---------- send ----------
  const [target, setTarget] = useState(() => {
    const to = new URLSearchParams(window.location.search).get('to');
    return to ? formatDeviceId(to) : '';
  });
  const [lookup, setLookup] = useState<{ loading: boolean; result?: LookupResult; error?: string }>({ loading: false });
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const autoSend = useRef(false); // true when files were picked after a valid ID was already entered

  const runLookup = useCallback(
    async (id: string) => {
      setLookup((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const result = await dev.lookup(id);
        setLookup({ loading: false, result });
      } catch (e: any) {
        setLookup({ loading: false, error: e?.message || 'Lookup failed' });
      }
    },
    [dev]
  );

  useEffect(() => {
    if (!isCompleteDeviceId(target)) {
      setLookup({ loading: false });
      return;
    }
    const t = setTimeout(() => runLookup(target), 300);
    const poll = setInterval(() => runLookup(target), 20000); // keep the online/offline state fresh
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const addFiles = (list: FileList | File[] | null) => {
    // Copy right away: a FileList from <input>/drop is "live" and is emptied as soon as the input is reset,
    // which happens before React runs the state updater below.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) return;
    if (isCompleteDeviceId(target)) autoSend.current = true;
    setFiles((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (!next.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) next.push(f);
      }
      return next;
    });
  };

  const isSelf = identity && formatDeviceId(target) === identity.deviceId;
  const target_ok = !!lookup.result?.exists && !isSelf;
  // The live connection is only needed for direct sends; without it the file goes through the server inbox.
  const canSend = target_ok && files.length > 0 && !sending && !!identity;

  const doSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const batch = files;
      setFiles([]);
      await dev.sendFiles(target, batch);
    } catch (e: any) {
      showToast('err', e?.message || 'Could not send.');
    } finally {
      setSending(false);
    }
  };

  // Picking files after entering a valid ID sends them straight away (no extra click).
  useEffect(() => {
    if (autoSend.current && canSend) {
      autoSend.current = false;
      void doSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, canSend]);

  // ---------- inbox actions ----------
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const run = async (key: string, fn: () => Promise<void>, okText?: string) => {
    setBusy((p) => ({ ...p, [key]: true }));
    try {
      await fn();
      if (okText) showToast('ok', okText);
    } catch (e: any) {
      showToast('err', e?.message || 'Something went wrong.');
    } finally {
      setBusy((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  };

  const [confirmRotate, setConfirmRotate] = useState(false);

  const connectionMeta = CONNECTION_LABEL[connection] || CONNECTION_LABEL.idle;
  const hasWork = dev.sends.length > 0;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
      {/* Title */}
      <div>
        <button type="button" onClick={onBack} className="inline-flex items-center space-x-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 mb-2 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to upload</span>
        </button>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">Devices</h1>
        <p className="text-sm text-stone-500 mt-1">Send files straight to another device with its ID. If you are both online the file goes directly, no upload needed.</p>
      </div>

      {!identity && connection === 'offline' && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">
          <span className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>{connectionError || 'Could not reach the server to create your device ID.'} We will keep trying.</span>
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* This device */}
        <section className="lg:col-span-2 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white p-6 shadow-xl shadow-indigo-500/20 space-y-5 self-start">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">This device</span>
            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${connectionMeta.cls}`}>
              {connection === 'online' ? <Wifi className="w-3 h-3" /> : connection === 'offline' ? <WifiOff className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{connectionMeta.text}</span>
            </span>
          </div>

          {identity ? (
            <>
              <div>
                <p className="text-[11px] text-white/70 mb-1">Your device ID</p>
                <p className="text-4xl sm:text-5xl font-black font-mono tracking-wider select-all">{identity.deviceId}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copy('id')} className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-bold cursor-pointer">
                  {copied === 'id' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'id' ? 'Copied' : 'Copy ID'}</span>
                </button>
                <button type="button" onClick={() => copy('link')} className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-bold cursor-pointer">
                  {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  <span>{copied === 'link' ? 'Copied' : 'Copy send link'}</span>
                </button>
              </div>

              <div className="flex items-center gap-4">
                {qr && <img src={qr} alt="QR code of your device ID" className="w-24 h-24 rounded-xl bg-white p-1.5 shrink-0" />}
                <p className="text-[11px] text-white/75 leading-relaxed">
                  Scan this QR code with another phone to open MakeTransfer with your ID filled in.
                </p>
              </div>

              <div className="pt-4 border-t border-white/20">
                <p className="text-[11px] text-white/70 mb-1">Device name</p>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={nameDraft}
                      maxLength={40}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white text-stone-900 text-sm focus:outline-none"
                    />
                    <button type="button" onClick={saveName} className="px-3 py-2 bg-white text-indigo-700 rounded-lg text-xs font-bold cursor-pointer">Save</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(identity.name);
                      setEditingName(true);
                    }}
                    className="inline-flex items-center space-x-2 text-sm font-bold hover:text-white/80 cursor-pointer"
                  >
                    <span>{identity.name}</span>
                    <Pencil className="w-3.5 h-3.5 opacity-70" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="py-10 flex flex-col items-center space-y-3 text-white/80">
              <Loader2 className="w-7 h-7 animate-spin" />
              <p className="text-xs">Creating your device ID…</p>
            </div>
          )}
        </section>

        {/* Send */}
        <section className="lg:col-span-3 bg-white border border-stone-200 rounded-3xl p-6 space-y-5">
          <div className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Send className="w-4 h-4" /></span>
            <h2 className="text-base font-bold text-stone-900">Send to a device</h2>
          </div>

          <div>
            <label htmlFor="target-id" className="text-xs font-bold text-stone-700">Receiver’s device ID</label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="target-id"
                value={target}
                onChange={(e) => setTarget(formatDeviceId(e.target.value))}
                placeholder="ABC-123"
                autoComplete="off"
                spellCheck={false}
                className="w-40 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl font-mono text-lg font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
              <div className="text-xs min-h-[2.25rem] flex items-center">
                {lookup.loading && <span className="inline-flex items-center space-x-1.5 text-stone-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Looking up…</span></span>}
                {!lookup.loading && lookup.error && <span className="text-red-600">{lookup.error}</span>}
                {!lookup.loading && isSelf && <span className="text-amber-700 font-semibold">That is this device.</span>}
                {!lookup.loading && !isSelf && lookup.result && !lookup.result.exists && <span className="text-red-600 font-semibold">No device with that ID.</span>}
                {!lookup.loading && !isSelf && lookup.result?.exists && (
                  <span className="space-y-0.5">
                    <span className="block font-bold text-stone-900">{lookup.result.name}</span>
                    {lookup.result.online ? (
                      <span className="inline-flex items-center space-x-1 text-emerald-700 font-semibold"><Zap className="w-3 h-3" /><span>Online: sends directly</span></span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-stone-500 font-semibold"><Inbox className="w-3 h-3" /><span>Offline: goes to their inbox</span></span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-stone-300 hover:border-indigo-300 hover:bg-stone-50'}`}
          >
            <UploadCloud className="w-7 h-7 mx-auto text-stone-400" />
            <p className="text-sm font-semibold text-stone-700 mt-2">Drop files here or click to choose</p>
            <p className="text-[11px] text-stone-400 mt-1">Direct transfers have no size limit. Via the server: up to about 50 MB per file.</p>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs">
                  <span className="flex items-center space-x-2 min-w-0"><FileText className="w-4 h-4 text-stone-400 shrink-0" /><span className="truncate font-medium text-stone-800">{f.name}</span></span>
                  <span className="flex items-center space-x-3 shrink-0">
                    <span className="font-mono text-stone-400">{formatBytes(f.size)}</span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-stone-400 hover:text-red-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={doSend}
            disabled={!canSend}
            className="w-full inline-flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{sending ? 'Starting…' : files.length > 1 ? `Send ${files.length} files` : 'Send file'}</span>
          </button>
          {identity && connection !== 'online' && <p className="text-[11px] text-amber-700 text-center">Live connection is reconnecting. Files will be sent through the server inbox.</p>}
          {!identity && <p className="text-[11px] text-amber-700 text-center">Waiting for your device ID before you can send.</p>}
          {isCompleteDeviceId(target) && !lookup.loading && lookup.result && !lookup.result.exists && <p className="text-[11px] text-red-600 text-center">No device found with that ID.</p>}

          {hasWork && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-700">Transfers</h3>
                <button type="button" onClick={dev.clearFinishedSends} className="text-[11px] font-semibold text-stone-400 hover:text-stone-700 cursor-pointer">Clear finished</button>
              </div>
              {dev.sends.map((j) => <SendRow key={j.id} job={j} />)}
            </div>
          )}
        </section>
      </div>

      {/* Received directly */}
      {dev.received.length > 0 && (
        <section className="bg-white border border-emerald-200 rounded-3xl p-6 space-y-3">
          <div className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Zap className="w-4 h-4" /></span>
            <h2 className="text-base font-bold text-stone-900">Received directly</h2>
          </div>
          <p className="text-[11px] text-stone-500">These files are only held in this tab. Save them before you close or reload the page.</p>
          <ul className="space-y-2">
            {dev.received.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900 truncate">{f.name}</p>
                  <p className="text-[11px] text-stone-500">from {f.fromName} • {formatBytes(f.size)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {f.savedToDisk ? (
                    <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" /><span>Saved to disk</span></span>
                  ) : (
                    <a href={f.blobUrl} download={f.name} className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold">
                      <Download className="w-3.5 h-3.5" /><span>Save</span>
                    </a>
                  )}
                  <button type="button" onClick={() => dev.dismissReceived(f.id)} aria-label="Dismiss" className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-white cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Inbox */}
      <section className="bg-white border border-stone-200 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Inbox className="w-4 h-4" /></span>
            <h2 className="text-base font-bold text-stone-900">Inbox</h2>
            {dev.pendingCount > 0 && <span className="px-2 py-0.5 rounded-full bg-pink-600 text-white text-[10px] font-bold">{dev.pendingCount} new</span>}
          </div>
          <button type="button" onClick={() => run('refresh', dev.refreshInbox)} className="inline-flex items-center space-x-1.5 text-xs font-bold text-stone-500 hover:text-stone-800 cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${busy.refresh ? 'animate-spin' : ''}`} /><span>Refresh</span>
          </button>
        </div>

        {dev.incoming.length === 0 ? (
          <p className="text-sm text-stone-400 py-6 text-center">Nothing here yet. Files sent to your ID while you were offline will show up here for 24 hours.</p>
        ) : (
          <ul className="space-y-3">
            {dev.incoming.map((t) => (
              <InboxRow
                key={t.id}
                t={t}
                busy={!!busy[t.id]}
                onAccept={(trust) => run(t.id, () => dev.respond(t.id, 'accept', trust))}
                onDecline={() => run(t.id, () => dev.respond(t.id, 'decline'), 'Declined and deleted.')}
                onDownload={() => run(t.id, () => dev.downloadTransfer(t.id))}
                onRemove={() => run(t.id, () => dev.removeTransfer(t.id), 'Removed.')}
                onBlock={() => run(t.id, async () => { await dev.respond(t.id, 'decline'); await dev.updateSettings({ block: t.fromId }); }, `Blocked ${t.fromName}.`)}
              />
            ))}
          </ul>
        )}

        {dev.outgoing.length > 0 && (
          <div className="pt-4 border-t border-stone-100 space-y-2">
            <h3 className="text-xs font-bold text-stone-700">Recently sent via server</h3>
            <ul className="space-y-1.5">
              {dev.outgoing.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-xs text-stone-600">
                  <span className="truncate">{t.filename} <span className="text-stone-400">→ {t.toId}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusPill status={t.status} />
                    {t.status === 'pending' && (
                      <button type="button" onClick={() => run(t.id, () => dev.removeTransfer(t.id), 'Cancelled.')} className="text-[11px] font-semibold text-red-600 hover:underline cursor-pointer">Cancel</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Privacy */}
      <section className="bg-white border border-stone-200 rounded-3xl p-6 space-y-5">
        <div className="flex items-center space-x-2">
          <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center"><ShieldCheck className="w-4 h-4" /></span>
          <h2 className="text-base font-bold text-stone-900">Privacy and safety</h2>
        </div>

        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-sm font-bold text-stone-800">Anyone with my ID can send me files</span>
            <span className="block text-xs text-stone-500 mt-0.5">Nothing downloads until you accept. Turn this off to only receive from trusted devices.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.allowAnyone}
            onChange={(e) => run('allow', () => dev.updateSettings({ allowAnyone: e.target.checked }))}
            className="mt-1 w-5 h-5 accent-indigo-600 cursor-pointer shrink-0"
          />
        </label>

        <DeviceList title="Trusted devices" empty="None yet. Accepting with “Always accept” adds a device here." ids={settings.trusted} actionLabel="Remove" onAction={(id) => run(`u${id}`, () => dev.updateSettings({ untrust: id }))} />
        <DeviceList title="Blocked devices" empty="No blocked devices." ids={settings.blocked} actionLabel="Unblock" onAction={(id) => run(`b${id}`, () => dev.updateSettings({ unblock: id }))} />

        <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-stone-800">Regenerate my device ID</p>
            <p className="text-xs text-stone-500">Use this if your ID leaked. The old one stops working right away.</p>
          </div>
          {confirmRotate ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setConfirmRotate(false)} className="px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-700 cursor-pointer">Cancel</button>
              <button
                type="button"
                onClick={() => { setConfirmRotate(false); run('rotate', dev.rotateId, 'You have a new device ID.'); }}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Yes, regenerate
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRotate(true)} className="px-3 py-2 bg-white border border-stone-300 hover:border-red-300 hover:text-red-600 rounded-xl text-xs font-bold text-stone-700 cursor-pointer">Regenerate ID</button>
          )}
        </div>
      </section>

      {toast && (
        <div role="status" className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] px-4 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center space-x-2 ${toast.type === 'ok' ? 'bg-stone-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    accepted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    downloaded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    declined: 'bg-red-50 text-red-700 border-red-200',
    removed: 'bg-stone-100 text-stone-600 border-stone-200',
    cancelled: 'bg-stone-100 text-stone-600 border-stone-200',
    expired: 'bg-stone-100 text-stone-600 border-stone-200',
  };
  const label: Record<string, string> = { pending: 'Waiting', accepted: 'Accepted', downloaded: 'Delivered', declined: 'Declined', removed: 'Deleted', cancelled: 'Cancelled', expired: 'Expired' };
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${map[status] || map.removed}`}>{label[status] || status}</span>;
};

const SendRow: React.FC<{ job: SendJob }> = ({ job }) => {
  const statusText: Record<SendJob['status'], string> = {
    queued: 'Queued',
    waiting: 'Waiting for them to accept…',
    connecting: 'Connecting directly…',
    sending: job.mode === 'direct' ? 'Sending directly…' : 'Uploading…',
    done: job.mode === 'direct' ? 'Sent directly' : 'Delivered to their inbox',
    error: job.error || 'Failed',
    declined: job.error || 'Declined',
  };
  const failed = job.status === 'error' || job.status === 'declined';
  return (
    <div className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-bold text-stone-800 truncate">{job.fileName}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${job.mode === 'direct' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
          {job.mode === 'direct' ? 'Direct' : 'Via server'}
        </span>
      </div>
      <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${failed ? 'bg-red-500' : job.status === 'done' ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${failed ? 100 : job.progress}%` }} />
      </div>
      <p className={`text-[11px] ${failed ? 'text-red-600' : 'text-stone-500'}`}>
        {statusText[job.status]} {job.toName ? <span className="text-stone-400">• {job.toName}</span> : null}
        {(job.status === 'sending' || job.status === 'done') && <span className="text-stone-400"> • {formatBytes(job.size)}</span>}
      </p>
    </div>
  );
};

interface InboxRowProps {
  t: TransferInfo;
  busy: boolean;
  onAccept: (trust: boolean) => void;
  onDecline: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onBlock: () => void;
}

const InboxRow: React.FC<InboxRowProps> = ({ t, busy, onAccept, onDecline, onDownload, onRemove, onBlock }) => {
  const [trust, setTrust] = useState(false);
  return (
    <li className={`rounded-2xl border p-4 space-y-3 ${t.status === 'pending' ? 'border-amber-200 bg-amber-50/40' : 'border-stone-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900 truncate">{t.filename}</p>
          <p className="text-xs text-stone-500 mt-0.5">
            from <strong className="text-stone-700">{t.fromName}</strong> <span className="font-mono text-stone-400">({t.fromId})</span> • {formatBytes(t.size)}
            {t.isFolder && t.totalFiles ? ` • ${t.totalFiles} files` : ''} • {formatDate(t.createdAt)}
          </p>
          {t.note && <p className="text-xs text-stone-600 mt-1 italic">“{t.note}”</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={t.status} />
          <span className="inline-flex items-center space-x-1 text-[11px] text-stone-400"><Clock className="w-3 h-3" /><span>{formatTimeRemaining(t.expiresAt)}</span></span>
        </div>
      </div>

      {t.flagged && (
        <div className="flex items-center space-x-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>This file type can run programs. Only open it if you trust the sender.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {t.status === 'pending' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => onAccept(trust)} className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}<span>Accept</span>
              </button>
              <button type="button" disabled={busy} onClick={onDecline} className="px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">Decline</button>
              <label className="inline-flex items-center space-x-1.5 text-[11px] text-stone-500 cursor-pointer">
                <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
                <span>Always accept from this device</span>
              </label>
            </div>
            <button type="button" disabled={busy} onClick={onBlock} className="inline-flex items-center space-x-1 text-[11px] font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50">
              <Ban className="w-3 h-3" /><span>Block sender</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onDownload} className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /><span>{t.status === 'downloaded' ? 'Download again' : 'Download'}</span>
            </button>
            <button type="button" disabled={busy} onClick={onRemove} className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
            </button>
          </>
        )}
      </div>
    </li>
  );
};

const DeviceList: React.FC<{ title: string; empty: string; ids: string[]; actionLabel: string; onAction: (id: string) => void }> = ({ title, empty, ids, actionLabel, onAction }) => (
  <div>
    <p className="text-xs font-bold text-stone-700 mb-2">{title}</p>
    {ids.length === 0 ? (
      <p className="text-xs text-stone-400">{empty}</p>
    ) : (
      <ul className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <li key={id} className="inline-flex items-center space-x-2 px-3 py-1.5 bg-stone-100 border border-stone-200 rounded-full text-xs">
            <span className="font-mono font-bold text-stone-700">{id}</span>
            <button type="button" onClick={() => onAction(id)} className="text-stone-400 hover:text-red-600 font-semibold cursor-pointer">{actionLabel}</button>
          </li>
        ))}
      </ul>
    )}
  </div>
);
