// Client helpers for device IDs, the relay inbox and signalling.
import { apiUrl, API_BASE } from './apiBase';

export interface DeviceIdentity {
  deviceId: string;
  deviceKey: string;
  name: string;
}

export interface DeviceSettings {
  allowAnyone: boolean;
  trusted: string[];
  blocked: string[];
}

export type TransferStatus =
  | 'pending'
  | 'accepted'
  | 'downloaded'
  | 'declined'
  | 'removed'
  | 'cancelled'
  | 'expired';

export interface TransferInfo {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
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

export interface LookupResult {
  exists: boolean;
  deviceId?: string;
  name?: string;
  online?: boolean;
}

const STORAGE_KEY = 'maketransfer_device_v1';

export function readIdentity(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.deviceId && parsed?.deviceKey) return parsed as DeviceIdentity;
  } catch {}
  return null;
}

export function writeIdentity(identity: DeviceIdentity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {}
}

export function clearIdentity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// "k7m4qp" -> "K7M-4QP" (as the user types)
export function formatDeviceId(raw: string): string {
  const clean = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

export function isCompleteDeviceId(raw: string): boolean {
  return formatDeviceId(raw).replace('-', '').length === 6;
}

export function guessDeviceName(): string {
  const ua = navigator.userAgent || '';
  let os = 'Device';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/CrOS/i.test(ua)) os = 'Chromebook';
  else if (/Linux/i.test(ua)) os = 'Linux PC';
  let browser = '';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return browser ? `${os} (${browser})` : os;
}

export class DeviceApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 75000); // a sleeping server needs up to a minute
  const host = API_BASE || window.location.origin;
  try {
    const res = await fetch(apiUrl(path), { ...init, signal: controller.signal });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = null; }

    if (data === null) {
      // Not JSON: usually the static site answered instead of the API (API URL missing from this build)
      throw new DeviceApiError(
        res.ok
          ? `${host} answered with a web page instead of the API. This build probably has no backend URL (VITE_API_BASE_URL).`
          : `The server at ${host} returned an error (HTTP ${res.status}).`,
        res.status,
        'BAD_RESPONSE'
      );
    }
    if (!res.ok) {
      if (res.status === 404 && path.startsWith('/api/devices') && /not found/i.test(String(data?.error || '')) && !data?.code) {
        throw new DeviceApiError(`The backend at ${host} does not have the Devices feature yet. It needs to be redeployed with the latest code.`, 404, 'OLD_BACKEND');
      }
      throw new DeviceApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
    }
    return data;
  } catch (err: any) {
    if (err instanceof DeviceApiError) throw err;
    throw new DeviceApiError(
      err?.name === 'AbortError' ? `The server at ${host} took too long to respond.` : `Could not reach ${host}. If it is a free Render server it may be waking up.`,
      0,
      'NETWORK'
    );
  } finally {
    clearTimeout(timer);
  }
}

const post = (path: string, body: any, timeoutMs?: number) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeoutMs });

const auth = (id: DeviceIdentity) => ({ deviceId: id.deviceId, deviceKey: id.deviceKey });

// Register this browser (or restore it after a server restart). Creates a new identity when none is stored.
export async function registerDevice(): Promise<{ identity: DeviceIdentity; settings: DeviceSettings }> {
  const stored = readIdentity();
  try {
    const data = await post('/api/devices/register', {
      deviceId: stored?.deviceId,
      deviceKey: stored?.deviceKey,
      name: stored?.name || guessDeviceName(),
    });
    const identity: DeviceIdentity = {
      deviceId: data.device.deviceId,
      deviceKey: data.deviceKey || stored!.deviceKey,
      name: data.device.name,
    };
    writeIdentity(identity);
    return { identity, settings: toSettings(data.device) };
  } catch (err) {
    // Our stored ID was claimed by someone else: start over with a fresh one
    if (err instanceof DeviceApiError && err.code === 'ID_TAKEN') {
      clearIdentity();
      return registerDevice();
    }
    throw err;
  }
}

export const toSettings = (d: any): DeviceSettings => ({
  allowAnyone: d?.allowAnyone !== false,
  trusted: d?.trusted || [],
  blocked: d?.blocked || [],
});

export async function createSession(identity: DeviceIdentity): Promise<string> {
  const data = await post('/api/devices/session', auth(identity));
  return data.sid as string;
}

export async function lookupDevice(rawId: string): Promise<LookupResult> {
  return request(`/api/devices/lookup/${encodeURIComponent(formatDeviceId(rawId))}`, { timeoutMs: 75000 });
}

export async function fetchInbox(identity: DeviceIdentity): Promise<{ settings: DeviceSettings; name: string; incoming: TransferInfo[]; outgoing: TransferInfo[] }> {
  const data = await post('/api/devices/inbox', auth(identity));
  return { settings: toSettings(data.device), name: data.device.name, incoming: data.incoming || [], outgoing: data.outgoing || [] };
}

export async function respondToTransfer(identity: DeviceIdentity, tid: string, action: 'accept' | 'decline', trust = false) {
  return post(`/api/devices/transfers/${encodeURIComponent(tid)}/respond`, { ...auth(identity), action, trust });
}

export async function removeTransferApi(identity: DeviceIdentity, tid: string) {
  return post(`/api/devices/transfers/${encodeURIComponent(tid)}/remove`, auth(identity));
}

export async function updateDeviceSettings(
  identity: DeviceIdentity,
  patch: { name?: string; allowAnyone?: boolean; trust?: string; untrust?: string; block?: string; unblock?: string }
): Promise<{ name: string; settings: DeviceSettings }> {
  const data = await post('/api/devices/settings', { ...auth(identity), ...patch });
  return { name: data.device.name, settings: toSettings(data.device) };
}

export async function rotateDevice(identity: DeviceIdentity): Promise<{ identity: DeviceIdentity; settings: DeviceSettings }> {
  const data = await post('/api/devices/rotate', auth(identity));
  const next: DeviceIdentity = { deviceId: data.device.deviceId, deviceKey: data.deviceKey, name: data.device.name };
  writeIdentity(next);
  return { identity: next, settings: toSettings(data.device) };
}

export async function sendTransferViaServer(identity: DeviceIdentity, toDeviceId: string, slug: string, managementToken: string, note?: string) {
  return post('/api/devices/send', { ...auth(identity), toDeviceId: formatDeviceId(toDeviceId), slug, managementToken, note }, 120000);
}

export async function postSignal(sid: string, toDeviceId: string, type: string, tid: string, payload?: any) {
  return post('/api/devices/signal', { sid, toDeviceId, type, tid, payload }, 20000);
}

export function eventsUrl(sid: string): string {
  return apiUrl(`/api/devices/events?sid=${encodeURIComponent(sid)}`);
}

export function transferDownloadUrl(tid: string, sid: string): string {
  return apiUrl(`/api/devices/transfers/${encodeURIComponent(tid)}/download?sid=${encodeURIComponent(sid)}`);
}
