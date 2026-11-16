import crypto from 'crypto';

// Use URL-friendly, legible characters (avoiding easily confused chars like 0/O, 1/l/I)
const SAFE_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateSlug(length: number = 6): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += SAFE_ALPHABET[bytes[i] % SAFE_ALPHABET.length];
  }
  return result;
}

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  // Allow nested sub-paths with '/' (e.g. "team/project-1" or "2026/quarter-1/report"), max 64 chars total
  // Cannot start or end with a slash, cannot have consecutive slashes
  if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.includes('//')) return false;
  return /^[a-zA-Z0-9_/-]{3,64}$/.test(trimmed);
}

export function generateManagementToken(): string {
  return crypto.randomBytes(24).toString('hex');
}
