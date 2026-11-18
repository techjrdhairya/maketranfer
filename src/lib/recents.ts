// Recently used (and starred) receiver devices, kept in this browser only.
const KEY = 'maketransfer_recent_devices_v1';
const MAX_RECENT = 10;

export interface RecentDevice {
  id: string;
  name: string;
  favorite: boolean;
  lastUsed: number;
}

function read(): RecentDevice[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((d) => d && typeof d.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: RecentDevice[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

/** Favorites first, then most recently used. */
export function getRecentDevices(): RecentDevice[] {
  return read().sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastUsed - a.lastUsed);
}

export function rememberDevice(id: string, name: string) {
  const list = read();
  const existing = list.find((d) => d.id === id);
  if (existing) {
    existing.name = name || existing.name;
    existing.lastUsed = Date.now();
  } else {
    list.push({ id, name: name || id, favorite: false, lastUsed: Date.now() });
  }
  const favorites = list.filter((d) => d.favorite);
  const recent = list.filter((d) => !d.favorite).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_RECENT);
  write([...favorites, ...recent]);
}

export function toggleFavorite(id: string) {
  write(read().map((d) => (d.id === id ? { ...d, favorite: !d.favorite } : d)));
}

export function forgetDevice(id: string) {
  write(read().filter((d) => d.id !== id));
}
