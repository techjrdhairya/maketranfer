export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDate(isoString?: string | null): string {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeRemaining(isoString?: string | null): string {
  if (!isoString) return 'No expiration';
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) {
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function getFileCategoryColor(extension: string): { bg: string; text: string; border: string } {
  const ext = extension.toLowerCase();
  if (ext === 'pdf') return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
  if (['docx', 'doc'].includes(ext)) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (['xlsx', 'xls', 'csv'].includes(ext)) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  if (['pptx', 'ppt'].includes(ext)) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  if (['md', 'txt', 'json', 'js', 'ts', 'py', 'html', 'css'].includes(ext)) return { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' };
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' };
}
