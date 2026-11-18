// Direct device-to-device file transfer over a WebRTC data channel.
// Signalling (offer / answer / ICE) is relayed by the MakeTransfer server; the file itself never touches it.

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;
const ACCEPT_TIMEOUT_MS = 90_000;
const CONNECT_TIMEOUT_MS = 25_000;

export type P2PErrorCode = 'DECLINED' | 'TIMEOUT' | 'CONNECT' | 'ABORTED' | 'FAILED';

export class P2PError extends Error {
  code: P2PErrorCode;
  constructor(code: P2PErrorCode, message?: string) {
    super(message || code);
    this.code = code;
  }
}

export interface P2PFileMeta {
  name: string;
  size: number;
  type: string;
}

export type SignalSender = (type: string, payload?: any) => Promise<void>;
export type SignalListener = (type: string, payload: any) => void;
export interface SignalRegistry {
  on(tid: string, listener: SignalListener): void;
  off(tid: string): void;
}

export const isP2PSupported = () => typeof RTCPeerConnection !== 'undefined';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function withTimeout<T>(p: Promise<T>, ms: number, code: P2PErrorCode, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new P2PError(code, message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function waitBufferLow(dc: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      dc.removeEventListener('bufferedamountlow', onLow);
      dc.removeEventListener('close', onClose);
    };
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new P2PError('CONNECT', 'Connection closed'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new P2PError('TIMEOUT', 'Transfer stalled'));
    }, 30_000);
    dc.addEventListener('bufferedamountlow', onLow);
    dc.addEventListener('close', onClose);
  });
}

const descToJson = (d: RTCSessionDescription | RTCSessionDescriptionInit | null) => (d ? { type: d.type, sdp: d.sdp } : null);

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------
export interface SendP2POptions {
  files: File[];
  fromName: string;
  signal: SignalSender;
  registry: SignalRegistry;
  tid: string;
  onStatus: (s: 'waiting' | 'connecting' | 'sending') => void;
  onProgress: (fileIndex: number, totalPercent: number) => void;
  isAborted: () => boolean;
}

export async function sendFilesP2P(opts: SendP2POptions): Promise<void> {
  const { files, signal, registry, tid } = opts;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let remoteSet = false;
  const pendingIce: RTCIceCandidateInit[] = [];
  const accept = deferred<void>();
  const ack = deferred<void>();
  const failure = deferred<never>();
  let finished = false;

  const cleanup = () => {
    finished = true;
    registry.off(tid);
    try {
      dc?.close();
    } catch {}
    try {
      pc?.close();
    } catch {}
  };

  registry.on(tid, async (type, payload) => {
    try {
      if (type === 'accept') accept.resolve();
      else if (type === 'decline') accept.reject(new P2PError('DECLINED', 'The other device declined the transfer.'));
      else if (type === 'cancel') failure.reject(new P2PError('ABORTED', 'The other device cancelled.'));
      else if (type === 'answer' && pc) {
        await pc.setRemoteDescription(payload);
        remoteSet = true;
        for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (type === 'ice') {
        if (pc && remoteSet) await pc.addIceCandidate(payload).catch(() => {});
        else pendingIce.push(payload);
      }
    } catch (e) {
      failure.reject(new P2PError('CONNECT', 'Could not set up the connection.'));
    }
  });
  failure.promise.catch(() => {}); // avoid unhandled rejection noise

  try {
    const meta: P2PFileMeta[] = files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' }));
    opts.onStatus('waiting');
    await signal('request', { files: meta, fromName: opts.fromName });

    // Wait until the other person accepts
    await Promise.race([
      withTimeout(accept.promise, ACCEPT_TIMEOUT_MS, 'TIMEOUT', 'The other device did not respond.'),
      failure.promise,
    ]);

    opts.onStatus('connecting');
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && !finished) signal('ice', e.candidate.toJSON()).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed') && !finished) {
        failure.reject(new P2PError('CONNECT', 'The direct connection failed.'));
      }
    };

    dc = pc.createDataChannel('file', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = LOW_WATER;
    const channel = dc;

    const opened = deferred<void>();
    channel.onopen = () => opened.resolve();
    channel.onerror = () => failure.reject(new P2PError('CONNECT', 'Data channel error.'));
    channel.onclose = () => {
      if (!finished) failure.reject(new P2PError('CONNECT', 'Connection closed.'));
    };
    channel.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === 'ack') ack.resolve();
        if (msg.t === 'cancel') failure.reject(new P2PError('ABORTED', 'The other device cancelled.'));
      } catch {}
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signal('offer', descToJson(pc.localDescription));

    await Promise.race([
      withTimeout(opened.promise, CONNECT_TIMEOUT_MS, 'CONNECT', 'Could not open a direct connection.'),
      failure.promise,
    ]);

    // Stream the files
    opts.onStatus('sending');
    const total = files.reduce((n, f) => n + f.size, 0) || 1;
    let sentTotal = 0;

    const sendAll = async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        channel.send(JSON.stringify({ t: 'file', i, name: file.name, size: file.size, type: file.type || 'application/octet-stream' }));
        let offset = 0;
        while (offset < file.size) {
          if (opts.isAborted()) throw new P2PError('ABORTED', 'Cancelled.');
          if (channel.readyState !== 'open') throw new P2PError('CONNECT', 'Connection closed.');
          const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
          while (channel.bufferedAmount > HIGH_WATER) await waitBufferLow(channel);
          channel.send(buf);
          offset += buf.byteLength;
          sentTotal += buf.byteLength;
          opts.onProgress(i, Math.min(99, Math.round((sentTotal / total) * 100)));
        }
        channel.send(JSON.stringify({ t: 'end', i }));
      }
      channel.send(JSON.stringify({ t: 'done' }));
      // The receiver confirms once everything is saved; closing earlier would drop buffered data
      await withTimeout(ack.promise, 120_000, 'TIMEOUT', 'The other device did not confirm the transfer.');
    };

    await Promise.race([sendAll(), failure.promise]);
    opts.onProgress(files.length - 1, 100);
  } catch (err) {
    if (!finished) {
      try {
        await signal('cancel', null);
      } catch {}
    }
    throw err instanceof P2PError ? err : new P2PError('FAILED', (err as any)?.message || 'Transfer failed');
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------
export interface FileWriter {
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface ReceiveP2POptions {
  tid: string;
  files: P2PFileMeta[];
  signal: SignalSender;
  registry: SignalRegistry;
  writer?: FileWriter | null; // single large file streamed straight to disk (File System Access API)
  onProgress: (percent: number) => void;
  onFile: (file: { name: string; size: number; type: string; blob?: Blob; savedToDisk?: boolean }) => void;
  onDone: () => void;
  onError: (err: P2PError) => void;
}

export function receiveFilesP2P(opts: ReceiveP2POptions): { cancel: () => void } {
  const { tid, signal, registry } = opts;
  let pc: RTCPeerConnection | null = null;
  let remoteSet = false;
  const pendingIce: RTCIceCandidateInit[] = [];
  let finished = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;

  const total = opts.files.reduce((n, f) => n + f.size, 0) || 1;
  let receivedTotal = 0;
  let current: { meta: P2PFileMeta; chunks: ArrayBuffer[] } | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let closeChain: Promise<void> = Promise.resolve();
  let activeDc: RTCDataChannel | null = null;

  const finish = (err?: P2PError) => {
    if (finished) return;
    finished = true;
    if (waitTimer) clearTimeout(waitTimer);
    registry.off(tid);
    try {
      activeDc?.close();
    } catch {}
    try {
      pc?.close();
    } catch {}
    if (err) {
      opts.writer?.abort?.().catch(() => {});
      opts.onError(err);
    } else {
      opts.onDone();
    }
  };

  // The sender must open the connection soon after we accept
  waitTimer = setTimeout(() => finish(new P2PError('TIMEOUT', 'The sender did not start the transfer.')), 60_000);

  const handleChannel = (dc: RTCDataChannel) => {
    activeDc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onclose = () => {
      if (!finished) finish(new P2PError('CONNECT', 'Connection closed before the transfer finished.'));
    };
    dc.onmessage = async (e) => {
      try {
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (msg.t === 'file') {
            current = { meta: { name: msg.name, size: msg.size, type: msg.type }, chunks: [] };
          } else if (msg.t === 'end' && current) {
            const meta = current.meta;
            if (opts.writer) {
              closeChain = writeChain.then(() => opts.writer!.close());
              opts.onFile({ name: meta.name, size: meta.size, type: meta.type, savedToDisk: true });
            } else {
              opts.onFile({ name: meta.name, size: meta.size, type: meta.type, blob: new Blob(current.chunks, { type: meta.type }) });
            }
            current = null;
          } else if (msg.t === 'done') {
            await closeChain;
            dc.send(JSON.stringify({ t: 'ack' }));
            opts.onProgress(100);
            setTimeout(() => finish(), 300); // let the ack flush
          } else if (msg.t === 'cancel') {
            finish(new P2PError('ABORTED', 'The sender cancelled.'));
          }
        } else if (current) {
          const buf = e.data as ArrayBuffer;
          if (opts.writer) writeChain = writeChain.then(() => opts.writer!.write(buf));
          else current.chunks.push(buf);
          receivedTotal += buf.byteLength;
          opts.onProgress(Math.min(99, Math.round((receivedTotal / total) * 100)));
        }
      } catch {
        finish(new P2PError('FAILED', 'Could not receive the file.'));
      }
    };
  };

  registry.on(tid, async (type, payload) => {
    try {
      if (type === 'offer') {
        if (waitTimer) {
          clearTimeout(waitTimer);
          waitTimer = setTimeout(() => finish(new P2PError('CONNECT', 'Could not open a direct connection.')), CONNECT_TIMEOUT_MS + 60_000);
        }
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc.onicecandidate = (e) => {
          if (e.candidate && !finished) signal('ice', e.candidate.toJSON()).catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          if (pc && pc.connectionState === 'failed') finish(new P2PError('CONNECT', 'The direct connection failed.'));
        };
        pc.ondatachannel = (ev) => handleChannel(ev.channel);
        await pc.setRemoteDescription(payload);
        remoteSet = true;
        for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await signal('answer', descToJson(pc.localDescription));
      } else if (type === 'ice') {
        if (pc && remoteSet) await pc.addIceCandidate(payload).catch(() => {});
        else pendingIce.push(payload);
      } else if (type === 'cancel') {
        finish(new P2PError('ABORTED', 'The sender cancelled.'));
      }
    } catch {
      finish(new P2PError('CONNECT', 'Could not set up the connection.'));
    }
  });

  return {
    cancel: () => {
      try {
        activeDc?.send(JSON.stringify({ t: 'cancel' }));
      } catch {}
      signal('cancel', null).catch(() => {});
      finish(new P2PError('ABORTED', 'Cancelled.'));
    },
  };
}
