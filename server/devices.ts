// Device IDs, relay inbox and WebRTC signalling for "send to a device".
//
// - Every browser can register a device and gets a short ID (e.g. K7M-4QP) plus a secret key.
// - Direct mode: both devices are online -> signalling messages (WebRTC offer/answer/ICE) are relayed over
//   Server-Sent Events and the file travels device-to-device.
// - Relay mode: the receiver is offline (or direct failed) -> the file is uploaded as a private draft document and
//   an entry appears in the receiver's inbox. Nothing can be downloaded before the receiver accepts.
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { getFirestoreDB, isQuotaExhausted, removeUndefinedFields } from './firebase.js';
import { storage } from './storage.js';

const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COL_DEVICES = 'mtDevices';
const COL_TRANSFERS = 'mtTransfers';

interface Device {
  id: string;
  keyHash: string;
  name: string;
  createdAt: string;
  allowAnyone: boolean;
  trusted: string[];
  blocked: string[];
}

type TransferStatus = 'pending' | 'accepted' | 'downloaded' | 'declined' | 'removed' | 'cancelled';

interface Transfer {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  slug: string;
  mgmt: string; // server-side only, never sent to clients
  filename: string;
  size: number;
  isFolder?: boolean;
  totalFiles?: number;
  note?: string;
  createdAt: string;
  expiresAt: string;
  status: TransferStatus;
  flagged?: boolean;
}

const devices = new Map<string, Device>();
const transfers = new Map<string, Transfer>();
const sessions = new Map<string, { deviceId: string; expiresAt: number }>();
const connections = new Map<string, Set<Response>>();
const buckets = new Map<string, { count: number; resetAt: number }>();

// ---------- helpers ----------
function normalizeId(raw: any): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 6) return null;
  for (const ch of clean) if (!ID_ALPHABET.includes(ch)) return null;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

function genId(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = crypto.randomBytes(6);
    let raw = '';
    for (let i = 0; i < 6; i++) raw += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    const id = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    if (!devices.has(id)) return id;
  }
  throw new Error('Could not allocate a device ID');
}

const hashKey = (key: string) => crypto.createHash('sha256').update(String(key)).digest('hex');
const newToken = (bytes = 18) => crypto.randomBytes(bytes).toString('hex');

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function authDevice(body: any): Device | null {
  const id = normalizeId(body?.deviceId);
  const key = body?.deviceKey;
  if (!id || typeof key !== 'string' || key.length < 16) return null;
  const dev = devices.get(id);
  if (!dev || !safeEqual(dev.keyHash, hashKey(key))) return null;
  return dev;
}

function sessionDevice(sid: any): Device | null {
  if (typeof sid !== 'string') return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return devices.get(s.deviceId) || null;
}

const isOnline = (id: string) => (connections.get(id)?.size || 0) > 0;

const publicDevice = (d: Device) => ({
  deviceId: d.id,
  name: d.name,
  allowAnyone: d.allowAnyone,
  trusted: d.trusted,
  blocked: d.blocked,
});

const publicTransfer = (t: Transfer) => ({
  id: t.id,
  fromId: t.fromId,
  fromName: t.fromName,
  toId: t.toId,
  filename: t.filename,
  size: t.size,
  isFolder: t.isFolder,
  totalFiles: t.totalFiles,
  note: t.note,
  createdAt: t.createdAt,
  expiresAt: t.expiresAt,
  status: t.status,
  flagged: t.flagged,
});

function clientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  return (fwd.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
}

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

function pushEvent(deviceId: string, event: string, data: any): boolean {
  const set = connections.get(deviceId);
  if (!set || set.size === 0) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {}
  }
  return true;
}

// May `from` send to `to`? (blocked list + "only trusted devices" setting)
function canSend(from: Device, to: Device): boolean {
  if (to.blocked.includes(from.id)) return false;
  if (!to.allowAnyone && !to.trusted.includes(from.id)) return false;
  return true;
}

// ---------- Firestore mirror (best effort; memory is the source of truth while running) ----------
async function mirrorSet(col: string, id: string, data: any) {
  try {
    const db = getFirestoreDB();
    if (!db || isQuotaExhausted()) return;
    await setDoc(doc(db, col, id), removeUndefinedFields(data));
  } catch {
    /* rules not deployed / quota: ignore */
  }
}
async function mirrorDelete(col: string, id: string) {
  try {
    const db = getFirestoreDB();
    if (!db || isQuotaExhausted()) return;
    await deleteDoc(doc(db, col, id));
  } catch {}
}
async function mirrorLoad(col: string): Promise<any[]> {
  try {
    const db = getFirestoreDB();
    if (!db || isQuotaExhausted()) return [];
    const snap = await getDocs(collection(db, col));
    return snap.docs.map((d) => d.data());
  } catch {
    return [];
  }
}

const saveDevice = (d: Device) => void mirrorSet(COL_DEVICES, d.id, d);
const saveTransfer = (t: Transfer) => void mirrorSet(COL_TRANSFERS, t.id, t);

async function loadFromCloud() {
  const devs = await mirrorLoad(COL_DEVICES);
  for (const d of devs) if (d?.id && !devices.has(d.id)) devices.set(d.id, d as Device);
  const trs = await mirrorLoad(COL_TRANSFERS);
  for (const t of trs) if (t?.id && !transfers.has(t.id)) transfers.set(t.id, t as Transfer);
  if (devs.length || trs.length) console.log(`[devices] restored ${devs.length} devices, ${trs.length} transfers`);
}

async function discardTransferFile(t: Transfer) {
  try {
    await storage.forceDeleteDocument(t.slug);
  } catch (e) {
    console.warn('[devices] could not delete transfer file', t.slug, e);
  }
}

async function sweepExpired() {
  const now = Date.now();
  for (const t of Array.from(transfers.values())) {
    if (new Date(t.expiresAt).getTime() > now) continue;
    if (t.status === 'pending' || t.status === 'accepted' || t.status === 'downloaded') {
      await discardTransferFile(t);
    }
    transfers.delete(t.id);
    void mirrorDelete(COL_TRANSFERS, t.id);
    pushEvent(t.toId, 'transfer-update', { id: t.id, status: 'expired' });
    pushEvent(t.fromId, 'transfer-update', { id: t.id, status: 'expired' });
  }
  for (const [sid, s] of Array.from(sessions.entries())) {
    if (s.expiresAt < now) sessions.delete(sid);
  }
  for (const [k, b] of Array.from(buckets.entries())) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

// ---------- routes ----------
export function registerDeviceRoutes(app: Express) {
  void loadFromCloud();
  const sweeper = setInterval(() => void sweepExpired(), 10 * 60 * 1000);
  (sweeper as any).unref?.();

  const fail = (res: Response, status: number, error: string, code?: string) =>
    res.status(status).json({ error, code });

  // Register (or restore) a device. Without credentials a new ID + key is created.
  app.post('/api/devices/register', (req, res) => {
    if (!rateLimit(`reg:${clientIp(req)}`, 30, 60 * 60 * 1000)) return fail(res, 429, 'Too many requests. Try again later.');
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    const id = normalizeId(body.deviceId);
    const key = body.deviceKey;

    if (id && typeof key === 'string' && key.length >= 16) {
      const existing = devices.get(id);
      if (existing) {
        if (!safeEqual(existing.keyHash, hashKey(key))) return fail(res, 409, 'This device ID is already taken.', 'ID_TAKEN');
        if (name && name !== existing.name) {
          existing.name = name;
          saveDevice(existing);
        }
        return res.json({ device: publicDevice(existing) });
      }
      // Server forgot this device (restart): restore it with the same ID and key
      const restored: Device = {
        id,
        keyHash: hashKey(key),
        name: name || `Device ${id}`,
        createdAt: new Date().toISOString(),
        allowAnyone: true,
        trusted: [],
        blocked: [],
      };
      devices.set(id, restored);
      saveDevice(restored);
      return res.json({ device: publicDevice(restored) });
    }

    const newId = genId();
    const newKey = newToken(24);
    const dev: Device = {
      id: newId,
      keyHash: hashKey(newKey),
      name: name || `Device ${newId}`,
      createdAt: new Date().toISOString(),
      allowAnyone: true,
      trusted: [],
      blocked: [],
    };
    devices.set(newId, dev);
    saveDevice(dev);
    return res.json({ device: publicDevice(dev), deviceKey: newKey });
  });

  // Short-lived session used for the live connection and for downloads (the real key never goes in a URL)
  app.post('/api/devices/session', (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const sid = newToken(18);
    sessions.set(sid, { deviceId: dev.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return res.json({ sid, expiresIn: SESSION_TTL_MS / 1000 });
  });

  // Live connection (Server-Sent Events): presence + signalling + inbox notifications
  app.get('/api/devices/events', (req, res) => {
    const dev = sessionDevice(req.query.sid);
    if (!dev) return fail(res, 401, 'Session expired', 'BAD_SESSION');

    req.socket.setTimeout(0);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ deviceId: dev.id })}\n\n`);

    let set = connections.get(dev.id);
    if (!set) {
      set = new Set();
      connections.set(dev.id, set);
    }
    set.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      const s = connections.get(dev.id);
      if (s) {
        s.delete(res);
        if (s.size === 0) connections.delete(dev.id);
      }
    });
  });

  // Look up a device by ID (name + whether it is online)
  app.get('/api/devices/lookup/:id', (req, res) => {
    if (!rateLimit(`look:${clientIp(req)}`, 60, 60 * 1000)) return fail(res, 429, 'Too many lookups. Slow down.');
    const id = normalizeId(req.params.id);
    const dev = id ? devices.get(id) : undefined;
    if (!id || !dev) return res.json({ exists: false });
    return res.json({ exists: true, deviceId: dev.id, name: dev.name, online: isOnline(dev.id) });
  });

  // Inbox + recent outgoing transfers
  app.post('/api/devices/inbox', (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const list = Array.from(transfers.values());
    const incoming = list
      .filter((t) => t.toId === dev.id && ['pending', 'accepted', 'downloaded'].includes(t.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicTransfer);
    const outgoing = list
      .filter((t) => t.fromId === dev.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map(publicTransfer);
    return res.json({ device: publicDevice(dev), incoming, outgoing });
  });

  // Relay: hand an uploaded (draft) document to another device's inbox
  app.post('/api/devices/send', async (req, res) => {
    const from = authDevice(req.body);
    if (!from) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    if (!rateLimit(`send:${from.id}`, 40, 60 * 60 * 1000)) return fail(res, 429, 'You are sending too fast. Try again in a while.');

    const toId = normalizeId(req.body?.toDeviceId);
    const to = toId ? devices.get(toId) : undefined;
    if (!to) return fail(res, 404, 'That device ID does not exist.');
    if (!canSend(from, to)) return fail(res, 403, 'This device is not accepting transfers from you.');

    const slug = String(req.body?.slug || '').trim();
    const token = String(req.body?.managementToken || '');
    const doc = await storage.getBySlugAsync(slug);
    if (!doc || !token || doc.managementToken !== token) return fail(res, 400, 'Upload not found or not yours.');
    if (doc.status !== 'draft') return fail(res, 400, 'Only fresh uploads can be sent to a device.');

    const newMgmt = storage.transferOwnership(doc.slug);
    if (!newMgmt) return fail(res, 500, 'Could not hand over the file.');

    const t: Transfer = {
      id: newToken(9),
      fromId: from.id,
      fromName: from.name,
      toId: to.id,
      slug: doc.slug,
      mgmt: newMgmt,
      filename: doc.folderName || doc.originalFilename,
      size: doc.size,
      isFolder: doc.isFolder || false,
      totalFiles: doc.items ? doc.items.length : undefined,
      note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 200) : undefined,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TRANSFER_TTL_MS).toISOString(),
      status: 'pending',
      flagged: doc.scanStatus === 'flagged',
    };
    transfers.set(t.id, t);
    saveTransfer(t);
    pushEvent(to.id, 'transfer', publicTransfer(t));
    return res.json({ transfer: publicTransfer(t) });
  });

  // Receiver accepts / declines
  app.post('/api/devices/transfers/:tid/respond', async (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const t = transfers.get(req.params.tid);
    if (!t || t.toId !== dev.id) return fail(res, 404, 'Transfer not found.');
    if (t.status !== 'pending') return fail(res, 400, 'This transfer was already answered.');

    const action = req.body?.action;
    if (action === 'accept') {
      t.status = 'accepted';
      if (req.body?.trust && !dev.trusted.includes(t.fromId)) {
        dev.trusted.push(t.fromId);
        saveDevice(dev);
      }
    } else if (action === 'decline') {
      t.status = 'declined';
      await discardTransferFile(t);
    } else {
      return fail(res, 400, 'Unknown action.');
    }
    saveTransfer(t);
    pushEvent(t.fromId, 'transfer-update', publicTransfer(t));
    return res.json({ transfer: publicTransfer(t) });
  });

  // Receiver downloads an accepted transfer (session id in the URL, never the device key)
  app.get('/api/devices/transfers/:tid/download', async (req, res) => {
    const dev = sessionDevice(req.query.sid);
    if (!dev) return res.status(401).send('Session expired. Reload the page and try again.');
    const t = transfers.get(req.params.tid);
    if (!t || t.toId !== dev.id) return res.status(404).send('Transfer not found');
    if (t.status === 'pending') return res.status(403).send('Accept the transfer first');
    if (t.status !== 'accepted' && t.status !== 'downloaded') return res.status(404).send('Transfer is no longer available');
    if (new Date(t.expiresAt).getTime() < Date.now()) return res.status(410).send('Transfer expired');

    const doc = await storage.getBySlugAsync(t.slug);
    if (!doc) return res.status(404).send('File is no longer available');

    if (t.status === 'accepted') {
      t.status = 'downloaded';
      saveTransfer(t);
      pushEvent(t.fromId, 'transfer-update', publicTransfer(t));
    }

    // Reuse the normal download route: it streams files and builds ZIPs for folders
    req.url = `/api/files/${t.slug}/download`;
    req.headers['x-management-token'] = t.mgmt;
    (app as any).handle(req, res, () => res.status(500).end());
  });

  // Remove an inbox item (receiver) or cancel a pending one (sender)
  app.post('/api/devices/transfers/:tid/remove', async (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const t = transfers.get(req.params.tid);
    if (!t) return res.json({ success: true });
    const isReceiver = t.toId === dev.id;
    const isSender = t.fromId === dev.id;
    if (!isReceiver && !isSender) return fail(res, 404, 'Transfer not found.');
    if (isSender && !isReceiver && t.status !== 'pending') return fail(res, 400, 'Only pending transfers can be cancelled.');

    if (['pending', 'accepted', 'downloaded'].includes(t.status)) await discardTransferFile(t);
    t.status = isReceiver ? 'removed' : 'cancelled';
    saveTransfer(t);
    pushEvent(isReceiver ? t.fromId : t.toId, 'transfer-update', publicTransfer(t));
    return res.json({ success: true });
  });

  // Rename, privacy, trusted / blocked devices
  app.post('/api/devices/settings', (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const b = req.body || {};
    if (typeof b.name === 'string' && b.name.trim()) dev.name = b.name.trim().slice(0, 40);
    if (typeof b.allowAnyone === 'boolean') dev.allowAnyone = b.allowAnyone;
    const add = (list: string[], raw: any) => {
      const id = normalizeId(raw);
      if (id && id !== dev.id && !list.includes(id)) list.push(id);
    };
    const drop = (list: string[], raw: any) => {
      const id = normalizeId(raw);
      return id ? list.filter((x) => x !== id) : list;
    };
    if (b.trust) add(dev.trusted, b.trust);
    if (b.untrust) dev.trusted = drop(dev.trusted, b.untrust);
    if (b.block) {
      add(dev.blocked, b.block);
      dev.trusted = drop(dev.trusted, b.block);
    }
    if (b.unblock) dev.blocked = drop(dev.blocked, b.unblock);
    saveDevice(dev);
    return res.json({ device: publicDevice(dev) });
  });

  // New ID + key (e.g. the old ID leaked). Pending items move to the new ID.
  app.post('/api/devices/rotate', (req, res) => {
    const dev = authDevice(req.body);
    if (!dev) return fail(res, 401, 'Unknown device. Please reconnect.', 'BAD_DEVICE');
    const newId = genId();
    const newKey = newToken(24);
    const moved: Device = { ...dev, id: newId, keyHash: hashKey(newKey) };
    devices.delete(dev.id);
    void mirrorDelete(COL_DEVICES, dev.id);
    devices.set(newId, moved);
    saveDevice(moved);
    for (const t of transfers.values()) {
      if (t.toId === dev.id) t.toId = newId;
      if (t.fromId === dev.id) t.fromId = newId;
      saveTransfer(t);
    }
    for (const [sid, s] of Array.from(sessions.entries())) if (s.deviceId === dev.id) sessions.delete(sid);
    const set = connections.get(dev.id);
    if (set) {
      for (const r of set) {
        try {
          r.end();
        } catch {}
      }
      connections.delete(dev.id);
    }
    return res.json({ device: publicDevice(moved), deviceKey: newKey });
  });

  // WebRTC signalling relay (direct transfers)
  const SIGNAL_TYPES = new Set(['request', 'accept', 'decline', 'cancel', 'offer', 'answer', 'ice']);
  app.post('/api/devices/signal', (req, res) => {
    const from = sessionDevice(req.body?.sid);
    if (!from) return fail(res, 401, 'Session expired', 'BAD_SESSION');
    if (!rateLimit(`sig:${from.id}`, 400, 60 * 1000)) return fail(res, 429, 'Too many signals.');

    const toId = normalizeId(req.body?.toDeviceId);
    const to = toId ? devices.get(toId) : undefined;
    const type = String(req.body?.type || '');
    if (!to || !SIGNAL_TYPES.has(type)) return fail(res, 400, 'Bad signal.');
    if (type === 'request') {
      if (!rateLimit(`req:${from.id}`, 30, 60 * 60 * 1000)) return fail(res, 429, 'You are sending too fast.');
      if (!canSend(from, to)) return fail(res, 403, 'This device is not accepting transfers from you.');
    }
    const delivered = pushEvent(to.id, 'signal', {
      from: { id: from.id, name: from.name },
      type,
      tid: String(req.body?.tid || '').slice(0, 64),
      payload: req.body?.payload ?? null,
    });
    if (!delivered) return fail(res, 409, 'That device went offline.', 'OFFLINE');
    return res.json({ ok: true });
  });
}
