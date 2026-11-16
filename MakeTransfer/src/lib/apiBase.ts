// Shared API URL helper. Empty VITE_API_URL means same-origin (Render deployment).
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
