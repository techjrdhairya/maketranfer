import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Loader2,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { DocumentMetadata } from '../types';
import {
  deleteAllMyDocuments,
  deleteDocument,
  getEffectiveBaseUrl,
  getServerInfo,
  loadMyDocuments,
  publishDocument,
  removeMyUpload,
  ServerInfo,
  updateDocumentSettings,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { auth, deleteUserDocFromCloud } from '../lib/firebase';
import { navigateToSignIn } from '../lib/nav';
import { formatBytes, formatDate, formatTimeRemaining, getFileCategoryColor } from '../lib/format';

interface MyDocumentsPageProps {
  onOpenDocument: (slug: string) => void;
  onNewUpload: () => void;
}

type FilterKey = 'all' | 'published' | 'draft' | 'unpublished' | 'expired' | 'issues';
type SortKey = 'newest' | 'oldest' | 'views' | 'name' | 'size';

const STATUS_META: Record<string, { label: string; cls: string; hint?: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  draft: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 border-amber-200', hint: 'Not shared yet' },
  unpublished: { label: 'Unpublished', cls: 'bg-stone-100 text-stone-600 border-stone-200', hint: 'Link is switched off' },
  expired: { label: 'Expired', cls: 'bg-red-50 text-red-700 border-red-200', hint: 'Link has expired' },
  missing: { label: 'Unavailable', cls: 'bg-red-50 text-red-700 border-red-200', hint: 'No longer on the server' },
  unknown: { label: 'Unverified', cls: 'bg-slate-100 text-slate-600 border-slate-200', hint: 'Server not reachable' },
};

const EXPIRY_CHOICES = [
  { value: 'keep', label: 'Keep current' },
  { value: 'never', label: 'Never expires' },
  { value: '1h', label: '1 hour from now' },
  { value: '24h', label: '24 hours from now' },
  { value: '7d', label: '7 days from now' },
  { value: '30d', label: '30 days from now' },
];

function expiryToIso(choice: string): string | null | undefined {
  if (choice === 'keep') return undefined;
  if (choice === 'never') return null;
  const ms: Record<string, number> = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 };
  return new Date(Date.now() + ms[choice]).toISOString();
}

const displayName = (d: DocumentMetadata) => d.folderName || d.originalFilename || d.slug;

export const MyDocumentsPage: React.FC<MyDocumentsPageProps> = ({ onOpenDocument, onNewUpload }) => {
  const { user } = useAuth();

  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [waking, setWaking] = useState(false);
  const [offline, setOffline] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<DocumentMetadata[] | null>(null);
  const [confirmWorking, setConfirmWorking] = useState(false);
  const [qrDoc, setQrDoc] = useState<DocumentMetadata | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [settingsDoc, setSettingsDoc] = useState<DocumentMetadata | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const suppressEvents = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl = getEffectiveBaseUrl(serverInfo);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  // ---------- loading ----------
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setWaking(false);
    }
    const wakeTimer = !silent ? setTimeout(() => setWaking(true), 5000) : null;
    try {
      const result = await loadMyDocuments();
      setDocuments(result.documents);
      setOffline(result.offline);
      setSelected((prev) => {
        const slugs = new Set(result.documents.map((d) => d.slug));
        return new Set(Array.from(prev).filter((s) => slugs.has(s)));
      });
    } finally {
      if (wakeTimer) clearTimeout(wakeTimer);
      if (!silent) {
        setLoading(false);
        setWaking(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    getServerInfo().then((info) => info && setServerInfo(info));
  }, [load]);

  // Refresh when the tab regains focus and when uploads change elsewhere (never from our own actions)
  useEffect(() => {
    const refresh = () => {
      if (!suppressEvents.current && document.visibilityState !== 'hidden') load(true);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('maketransfer:uploads_updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('maketransfer:uploads_updated', refresh);
    };
  }, [load]);

  // QR code
  useEffect(() => {
    if (!qrDoc) {
      setQrUrl('');
      return;
    }
    QRCode.toDataURL(`${baseUrl}/d/${qrDoc.slug}`, { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [qrDoc, baseUrl]);

  // ---------- helpers ----------
  const tokenOf = (d: DocumentMetadata) => d.managementToken || '';
  const setWorking = (slug: string, label: string | null) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (label) next[slug] = label;
      else delete next[slug];
      return next;
    });

  const handleCopy = (slug: string) => {
    navigator.clipboard?.writeText(`${baseUrl}/d/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((c) => (c === slug ? null : c)), 2000);
  };

  const patchLocal = (slug: string, patch: Partial<DocumentMetadata>) =>
    setDocuments((prev) => prev.map((d) => (d.slug === slug ? { ...d, ...patch } : d)));

  // ---------- actions ----------
  const handlePublish = async (doc: DocumentMetadata) => {
    if (!tokenOf(doc)) return showToast('err', 'This browser does not hold the management key for that document.');
    setWorking(doc.slug, 'Publishing…');
    suppressEvents.current = true;
    try {
      if (doc.status === 'draft') {
        const res = await publishDocument(doc.slug, tokenOf(doc), {});
        patchLocal(doc.slug, { ...res.document, managementToken: tokenOf(doc) });
      } else {
        const updated = await updateDocumentSettings(doc.slug, tokenOf(doc), { status: 'published' });
        patchLocal(doc.slug, { ...updated, managementToken: tokenOf(doc) });
      }
      showToast('ok', `“${displayName(doc)}” is now published.`);
    } catch (err: any) {
      showToast('err', err?.message || 'Could not publish. Please try again.');
    } finally {
      setWorking(doc.slug, null);
      setTimeout(() => (suppressEvents.current = false), 600);
    }
  };

  const handleUnpublish = async (doc: DocumentMetadata) => {
    if (!tokenOf(doc)) return showToast('err', 'This browser does not hold the management key for that document.');
    setWorking(doc.slug, 'Unpublishing…');
    suppressEvents.current = true;
    try {
      const updated = await updateDocumentSettings(doc.slug, tokenOf(doc), { status: 'unpublished' });
      patchLocal(doc.slug, { ...updated, managementToken: tokenOf(doc) });
      showToast('ok', `“${displayName(doc)}” is no longer public.`);
    } catch (err: any) {
      showToast('err', err?.message || 'Could not unpublish. Please try again.');
    } finally {
      setWorking(doc.slug, null);
      setTimeout(() => (suppressEvents.current = false), 600);
    }
  };

  // Remove a document the server no longer has (just cleans this browser + the account record)
  const removeMissing = async (docs: DocumentMetadata[]) => {
    for (const d of docs) {
      removeMyUpload(d.slug);
      if (auth.currentUser) await deleteUserDocFromCloud(auth.currentUser.uid, d.slug).catch(() => {});
    }
  };

  const runDelete = async () => {
    if (!confirm || confirm.length === 0) return;
    const docs = confirm;
    setConfirmWorking(true);
    suppressEvents.current = true;
    try {
      const missing = docs.filter((d) => d.status === 'missing');
      const real = docs.filter((d) => d.status !== 'missing');

      const deletedSlugs: string[] = [];
      const failed: Array<{ slug: string; error: string }> = [];

      if (missing.length) {
        await removeMissing(missing);
        deletedSlugs.push(...missing.map((d) => d.slug));
      }

      if (real.length === 1) {
        const d = real[0];
        try {
          await deleteDocument(d.slug, tokenOf(d));
          deletedSlugs.push(d.slug);
        } catch (e: any) {
          failed.push({ slug: d.slug, error: e?.message || 'Delete failed' });
        }
      } else if (real.length > 1) {
        const r = await deleteAllMyDocuments(real);
        deletedSlugs.push(...r.deleted);
        failed.push(...r.failed);
      }

      if (deletedSlugs.length) {
        const gone = new Set(deletedSlugs);
        setDocuments((prev) => prev.filter((d) => !gone.has(d.slug)));
        setSelected((prev) => new Set(Array.from(prev).filter((s) => !gone.has(s))));
      }

      if (failed.length === 0) {
        showToast('ok', deletedSlugs.length === 1 ? 'Document deleted.' : `${deletedSlugs.length} documents deleted.`);
      } else {
        showToast('err', `${failed.length} could not be deleted: ${failed[0].error}`);
      }
      setConfirm(null);
      // Re-check with the server shortly after, so the list always reflects reality
      setTimeout(() => load(true), 1500);
    } catch (err: any) {
      showToast('err', err?.message || 'Delete failed. Please try again.');
    } finally {
      setConfirmWorking(false);
      setTimeout(() => (suppressEvents.current = false), 800);
    }
  };

  // ---------- derived lists ----------
  const counts = useMemo(() => {
    const c = { all: documents.length, published: 0, draft: 0, unpublished: 0, expired: 0, issues: 0 };
    let views = 0;
    let downloads = 0;
    for (const d of documents) {
      if (d.status === 'published') c.published++;
      else if (d.status === 'draft') c.draft++;
      else if (d.status === 'unpublished') c.unpublished++;
      else if (d.status === 'expired') c.expired++;
      else c.issues++;
      views += d.viewCount || 0;
      downloads += d.downloadCount || 0;
    }
    return { ...c, views, downloads };
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = documents.filter((d) => {
      if (filter === 'issues') {
        if (d.status !== 'missing' && d.status !== 'unknown') return false;
      } else if (filter !== 'all' && d.status !== filter) return false;
      if (!q) return true;
      return displayName(d).toLowerCase().includes(q) || d.slug.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
        case 'views':
          return (b.viewCount || 0) - (a.viewCount || 0);
        case 'name':
          return displayName(a).localeCompare(displayName(b));
        case 'size':
          return (b.size || 0) - (a.size || 0);
        default:
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
    });
    return list;
  }, [documents, query, filter, sort]);

  const allVisibleSelected = visible.length > 0 && visible.every((d) => selected.has(d.slug));
  const toggleSelect = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((d) => d.slug)));

  const selectedDocs = documents.filter((d) => selected.has(d.slug));

  const FILTERS: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'published', label: 'Published', count: counts.published },
    { key: 'draft', label: 'Drafts', count: counts.draft },
    { key: 'unpublished', label: 'Unpublished', count: counts.unpublished },
    { key: 'expired', label: 'Expired', count: counts.expired },
  ];
  if (counts.issues > 0) FILTERS.push({ key: 'issues', label: 'Needs attention', count: counts.issues });

  // ---------- render ----------
  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
      {/* Title */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onNewUpload}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to upload</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">My Documents</h1>
          <p className="text-sm text-stone-500 mt-1">Everything you have uploaded: publish, unpublish, edit link settings or delete.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-white border border-stone-200 hover:border-stone-300 text-stone-700 rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={onNewUpload}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New upload</span>
          </button>
        </div>
      </div>

      {/* Account banner */}
      {user ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-2xl text-xs">
          <span className="flex items-center space-x-2 text-stone-600 min-w-0">
            <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              Backed up to <strong className="text-stone-900">{user.email}</strong>
            </span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Synced</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs">
          <span className="flex items-center space-x-2 text-amber-900 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Guest mode:</strong> your list lives in this browser only. Sign in to keep it on every device.
            </span>
          </span>
          <button
            type="button"
            onClick={navigateToSignIn}
            className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Server status banners */}
      {offline && !loading && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-100 border border-slate-300 rounded-2xl text-xs text-slate-700">
          <span className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              <strong>Can’t reach the server.</strong> Showing the list saved in this browser, so statuses may be out of date.
            </span>
          </span>
          <button type="button" onClick={() => load()} className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold hover:bg-slate-50 cursor-pointer">
            Try again
          </button>
        </div>
      )}
      {loading && waking && (
        <div className="flex items-center space-x-2 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>The server is waking up. This can take up to a minute the first time.</span>
        </div>
      )}

      {/* Stats */}
      {!loading && documents.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: 'Documents', value: counts.all, tint: 'text-indigo-600 bg-indigo-50' },
            { icon: Globe, label: 'Published', value: counts.published, tint: 'text-emerald-600 bg-emerald-50' },
            { icon: Eye, label: 'Total views', value: counts.views, tint: 'text-violet-600 bg-violet-50' },
            { icon: Download, label: 'Downloads', value: counts.downloads, tint: 'text-pink-600 bg-pink-50' },
          ].map(({ icon: Icon, label, value, tint }) => (
            <div key={label} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center space-x-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
                <Icon className="w-5 h-5" />
              </span>
              <span>
                <span className="block text-xl font-black text-stone-900 leading-none">{value}</span>
                <span className="block text-[11px] font-semibold text-stone-500 mt-1">{label}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      {!loading && documents.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or link…"
                className="w-full pl-10 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
              aria-label="Sort documents"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="views">Most viewed</option>
              <option value="name">Name (A–Z)</option>
              <option value="size">Largest first</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  filter === f.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                }`}
              >
                {f.label} <span className={filter === f.key ? 'text-white/80' : 'text-stone-400'}>{f.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 bg-stone-100/80 border border-stone-200 rounded-xl text-xs">
            <label className="inline-flex items-center space-x-2 font-semibold text-stone-700 cursor-pointer select-none">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-indigo-600 cursor-pointer" />
              <span>{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
            </label>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setConfirm(selectedDocs)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete selected</span>
              </button>
            ) : (
              <span className="text-stone-400">{visible.length} shown</span>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-stone-200 rounded-2xl p-5 animate-pulse flex items-center space-x-4">
              <div className="w-11 h-11 rounded-xl bg-stone-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 bg-stone-100 rounded" />
                <div className="h-2.5 w-1/4 bg-stone-100 rounded" />
              </div>
              <div className="h-6 w-20 bg-stone-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-3xl py-20 px-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-900">No documents yet</h2>
            <p className="text-sm text-stone-500 mt-1 max-w-sm mx-auto">Upload a file or folder and it will show up here, ready to publish, track and manage.</p>
          </div>
          <button type="button" onClick={onNewUpload} className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold cursor-pointer">
            <Plus className="w-4 h-4" />
            <span>Upload your first file</span>
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl py-14 text-center text-sm text-stone-500">
          No documents match your search or filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((doc) => {
            const meta = STATUS_META[doc.status] || STATUS_META.unknown;
            const colors = getFileCategoryColor(doc.extension || '');
            const working = busy[doc.slug];
            const isPublished = doc.status === 'published';
            const isDraft = doc.status === 'draft';
            const isMissing = doc.status === 'missing';
            const isUnknown = doc.status === 'unknown';
            const canShare = isPublished;

            return (
              <li
                key={doc.slug}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition-colors ${
                  selected.has(doc.slug) ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <input
                    type="checkbox"
                    checked={selected.has(doc.slug)}
                    onChange={() => toggleSelect(doc.slug)}
                    aria-label={`Select ${displayName(doc)}`}
                    className="mt-3 w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                  />
                  <div
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold text-[10px] font-mono shrink-0 ${
                      doc.isFolder ? 'bg-amber-100 text-amber-800 border-amber-300' : `${colors.bg} ${colors.text} ${colors.border}`
                    }`}
                  >
                    {doc.isFolder ? 'DIR' : `.${(doc.extension || 'bin').slice(0, 4)}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-bold text-sm text-stone-900 truncate max-w-full">{displayName(doc)}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{formatBytes(doc.size || 0)}</span>
                      <span>•</span>
                      {doc.isFolder ? <span>{doc.totalFiles || doc.items?.length || 0} files</span> : <span>{formatDate(doc.uploadedAt)}</span>}
                      {meta.hint && (
                        <>
                          <span>•</span>
                          <span className="text-stone-400">{meta.hint}</span>
                        </>
                      )}
                    </p>

                    {canShare && (
                      <p className="text-[11px] font-mono text-stone-400 mt-1 truncate">
                        {baseUrl.replace(/^https?:\/\//, '')}/d/{doc.slug}
                      </p>
                    )}

                    {!isMissing && !isUnknown && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-stone-500">
                        <span className="inline-flex items-center space-x-1" title="Views">
                          <Eye className="w-3.5 h-3.5 text-stone-400" />
                          <span className="font-mono">{doc.viewCount || 0}</span>
                        </span>
                        <span className="inline-flex items-center space-x-1" title="Downloads">
                          <Download className="w-3.5 h-3.5 text-stone-400" />
                          <span className="font-mono">
                            {doc.downloadCount || 0}
                            {doc.maxDownloads ? ` / ${doc.maxDownloads}` : ''}
                          </span>
                        </span>
                        {doc.expiresAt && (
                          <span className="inline-flex items-center space-x-1 text-amber-700 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimeRemaining(doc.expiresAt)}</span>
                          </span>
                        )}
                        {doc.hasPassword && (
                          <span className="inline-flex items-center space-x-1 text-stone-700">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Password</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-stone-100 sm:ml-[3.25rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    {(isDraft || doc.status === 'unpublished') && (
                      <button
                        type="button"
                        disabled={!!working}
                        onClick={() => handlePublish(doc)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{working || (isDraft ? 'Publish' : 'Republish')}</span>
                      </button>
                    )}
                    {canShare && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenDocument(doc.slug)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(doc.slug)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          {copiedSlug === doc.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedSlug === doc.slug ? 'Copied' : 'Copy link'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrDoc(doc)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>QR</span>
                        </button>
                      </>
                    )}
                    {!isMissing && !isUnknown && (
                      <button
                        type="button"
                        disabled={!!working}
                        onClick={() => setSettingsDoc(doc)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>Settings</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isPublished && (
                      <button
                        type="button"
                        disabled={!!working}
                        onClick={() => handleUnpublish(doc)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>{working || 'Unpublish'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!!working}
                      onClick={() => setConfirm([doc])}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isMissing ? 'Remove from list' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Delete confirmation */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <span className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  {confirm.length === 1
                    ? confirm[0].status === 'missing'
                      ? 'Remove from your list?'
                      : 'Delete this document?'
                    : `Delete ${confirm.length} documents?`}
                </h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {confirm.length === 1
                    ? `“${displayName(confirm[0])}” will be permanently deleted and its link will stop working.`
                    : 'They will be permanently deleted and their links will stop working.'}{' '}
                  This cannot be undone.
                </p>
              </div>
            </div>
            {confirm.length > 1 && (
              <ul className="max-h-32 overflow-y-auto text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-1">
                {confirm.slice(0, 20).map((d) => (
                  <li key={d.slug} className="truncate">• {displayName(d)}</li>
                ))}
                {confirm.length > 20 && <li className="text-stone-400">…and {confirm.length - 20} more</li>}
              </ul>
            )}
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={confirmWorking}
                className="px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDelete}
                disabled={confirmWorking}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {confirmWorking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{confirmWorking ? 'Deleting…' : 'Yes, delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR modal */}
      {qrDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-bold text-stone-900 text-sm">QR code</h3>
              <button type="button" onClick={() => setQrDoc(null)} className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <p className="font-bold text-xs text-stone-900 truncate">{displayName(qrDoc)}</p>
              <p className="text-[11px] font-mono text-stone-500 truncate">{baseUrl}/d/{qrDoc.slug}</p>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex justify-center items-center">
              {qrUrl ? (
                <img src={qrUrl} alt="QR code" className="w-44 h-44 rounded-xl bg-white p-2 border border-stone-200" />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
              )}
            </div>
            <div className="flex flex-col space-y-2">
              <a
                href={qrUrl || undefined}
                download={`maketransfer-qr-${(displayName(qrDoc)).replace(/[^a-zA-Z0-9_-]/g, '_')}.png`}
                className={`w-full flex items-center justify-center space-x-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ${qrUrl ? '' : 'opacity-50 pointer-events-none'}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR code (.png)</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopy(qrDoc.slug)}
                className="w-full flex items-center justify-center space-x-1.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {copiedSlug === qrDoc.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSlug === qrDoc.slug ? 'Link copied' : 'Copy link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {settingsDoc && (
        <SettingsModal
          doc={settingsDoc}
          onClose={() => setSettingsDoc(null)}
          onSaved={(updated) => {
            patchLocal(settingsDoc.slug, { ...updated, managementToken: tokenOf(settingsDoc) });
            setSettingsDoc(null);
            showToast('ok', 'Settings saved.');
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] px-4 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center space-x-2 ${
            toast.type === 'ok' ? 'bg-stone-900 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface SettingsModalProps {
  doc: DocumentMetadata;
  onClose: () => void;
  onSaved: (updated: DocumentMetadata) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ doc, onClose, onSaved }) => {
  const [expiry, setExpiry] = useState('keep');
  const [password, setPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState(doc.maxDownloads ? String(doc.maxDownloads) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const token = doc.managementToken || '';
    if (!token) {
      setError('This browser does not hold the management key for that document.');
      return;
    }
    const updates: Record<string, any> = {};
    const iso = expiryToIso(expiry);
    if (iso !== undefined) updates.expiresAt = iso;
    if (removePassword) updates.password = '';
    else if (password.trim()) updates.password = password.trim();
    const max = maxDownloads.trim() === '' ? null : Number(maxDownloads);
    if (max !== null && (!Number.isFinite(max) || max < 1)) {
      setError('Download limit must be a whole number of 1 or more (or empty for unlimited).');
      return;
    }
    updates.maxDownloads = max === null ? null : Math.floor(max);

    setSaving(true);
    try {
      const updated = await updateDocumentSettings(doc.slug, token, updates);
      onSaved(updated);
    } catch (e: any) {
      setError(e?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-stone-900">Link settings</h3>
            <p className="text-xs text-stone-500 truncate">{doc.folderName || doc.originalFilename}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">{error}</div>}

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-stone-700">Expiry</span>
            {doc.expiresAt && <span className="text-[11px] text-stone-400 ml-2">now: {formatTimeRemaining(doc.expiresAt)}</span>}
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-stone-700">Password</span>
            <span className="text-[11px] text-stone-400 ml-2">{doc.hasPassword ? 'one is set' : 'none set'}</span>
            <input
              type="text"
              value={password}
              disabled={removePassword}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={doc.hasPassword ? 'Enter a new password to change it' : 'Optional'}
              autoComplete="off"
              className="mt-1.5 w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-stone-50"
            />
          </label>
          {doc.hasPassword && (
            <label className="inline-flex items-center space-x-2 text-xs font-semibold text-stone-700 cursor-pointer">
              <input type="checkbox" checked={removePassword} onChange={(e) => setRemovePassword(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              <span>Remove the password</span>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-bold text-stone-700">Download limit</span>
            <input
              type="number"
              min={1}
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="Unlimited"
              className="mt-1.5 w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{saving ? 'Saving…' : 'Save settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
