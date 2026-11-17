// Base URL of the MakeTransfer backend.
// - Empty (default): same origin (local dev, or when the server also serves the site).
// - Set VITE_API_BASE_URL at build time when the site is on Firebase Hosting (Spark)
//   and the Node backend runs elsewhere (e.g. Render).
export const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
