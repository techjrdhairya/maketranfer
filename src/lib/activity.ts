// Local activity log of what this browser sent and received (kept 30 days, stored only on this device).
const KEY = 'maketransfer_activity_v1';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 200;

export interface ActivityItem {
  id: string;
  dir: 'sent' | 'received';
  name: string;
  size: number;
  peerName: string;
  peerId?: string;
  mode: 'direct' | 'server';
  at: number;
}

export function getActivity(): ActivityItem[] {
  try {
    const list: ActivityItem[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    const cutoff = Date.now() - KEEP_MS;
    return (Array.isArray(list) ? list : []).filter((a) => a && a.at > cutoff).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function logActivity(item: Omit<ActivityItem, 'id' | 'at'>) {
  try {
    const list = [{ ...item, id: Math.random().toString(36).slice(2), at: Date.now() }, ...getActivity()].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('maketransfer:activity_updated'));
  } catch { /* storage blocked */ }
}

export function clearActivity() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('maketransfer:activity_updated'));
}
