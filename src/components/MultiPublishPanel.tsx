import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  Clock,
  ShieldCheck,
  Globe,
  QrCode,
  ArrowRight,
  Loader2,
  Sparkles,
  Share2,
  FileText,
  KeyRound,
  DownloadCloud,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  CheckCheck,
  Eye,
  Sliders,
  Pencil,
  Wand2,
  AlertCircle,
  X,
  RefreshCw,
  Save,
  Tag,
  Shield,
  FileCheck,
  Download,
} from 'lucide-react';
import { DocumentMetadata, PublishRequest, UploadResponse } from '../types';
import {
  publishBatch,
  checkSlugAvailability,
  updateDocumentSettings,
  saveMyUpload,
  removeMyUpload,
  getServerInfo,
  ServerInfo,
  getEffectiveBaseUrl,
} from '../lib/api';
import { formatBytes, getFileCategoryColor } from '../lib/format';

interface ItemConfig {
  customSlug: string;
  originalFilename?: string;
  password?: string;
  expiresIn?: string;
  maxDownloads?: string;
  description?: string;
}

interface MultiPublishPanelProps {
  uploadResponses: UploadResponse[];
  onOpenViewer: (slug: string) => void;
  onCancel: () => void;
}

// Convert a filename to a URL-safe slug (e.g. "Q3 Report (Final) 2026.pdf" -> "q3-report-final-2026")
function cleanFilenameToSlug(filename: string): string {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-alphanumeric except whitespace and hyphens
    .replace(/[\s_]+/g, '-') // replace spaces & underscores with hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .substring(0, 30);
}

export const MultiPublishPanel: React.FC<MultiPublishPanelProps> = ({
  uploadResponses,
  onOpenViewer,
  onCancel,
}) => {
  const [items, setItems] = useState<UploadResponse[]>(uploadResponses);

  // Global settings
  const [globalPassword, setGlobalPassword] = useState('');
  const [globalExpiresIn, setGlobalExpiresIn] = useState('never');
  const [globalMaxDownloads, setGlobalMaxDownloads] = useState('');
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);

  // Per-item configs (for pre-publish customizing)
  const [itemConfigs, setItemConfigs] = useState<Record<string, ItemConfig>>(() => {
    const map: Record<string, ItemConfig> = {};
    uploadResponses.forEach((item) => {
      map[item.slug] = {
        customSlug: item.document?.slug || item.slug,
        originalFilename: item.document?.originalFilename || item.slug,
        password: '',
        expiresIn: 'inherit',
        maxDownloads: '',
        description: '',
      };
    });
    return map;
  });

  // Slug availability checking state
  const [slugCheckingState, setSlugCheckingState] = useState<
    Record<string, { checking: boolean; available: boolean | null; error?: string }>
  >({});

  // Active editing modal/panel item slug
  const [editingItemSlug, setEditingItemSlug] = useState<string | null>(null);
  const [batchPrefixModalOpen, setBatchPrefixModalOpen] = useState(false);
  const [batchPrefixText, setBatchPrefixText] = useState('');

  // Post-publish live edit state
  const [postPublishEditSlug, setPostPublishEditSlug] = useState<string | null>(null);
  const [postPublishForm, setPostPublishForm] = useState<{
    customSlug: string;
    originalFilename: string;
    password: string;
    expiresIn: string;
    maxDownloads: string;
    description: string;
  }>({
    customSlug: '',
    originalFilename: '',
    password: '',
    expiresIn: 'never',
    maxDownloads: '',
    description: '',
  });
  const [isSavingPostEdit, setIsSavingPostEdit] = useState(false);
  const [postEditSaveSuccess, setPostEditSaveSuccess] = useState<string | null>(null);
  const [postEditError, setPostEditError] = useState<string | null>(null);

  // General state
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    getServerInfo().then((info) => {
      if (info) setServerInfo(info);
    });
  }, []);

  const effectiveBaseUrl = getEffectiveBaseUrl(serverInfo);
  const isLocalOrigin =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [preferCloudUrl, setPreferCloudUrl] = useState(true);

  const baseUrl =
    isLocalOrigin && preferCloudUrl
      ? serverInfo?.cloudAppUrl || serverInfo?.sharedAppUrl || effectiveBaseUrl
      : typeof window !== 'undefined'
      ? window.location.origin
      : effectiveBaseUrl;

  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [selectedQrSlug, setSelectedQrSlug] = useState<string | null>(null);
  const [multiQrDataUrls, setMultiQrDataUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedQrSlug) {
      const url = `${baseUrl}/d/${selectedQrSlug}`;
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1c1917',
          light: '#ffffff',
        },
      })
        .then((dataUri) => {
          setMultiQrDataUrls((prev) => ({ ...prev, [selectedQrSlug]: dataUri }));
        })
        .catch((err) => console.warn('QR error:', err));
    }
  }, [selectedQrSlug, baseUrl]);

  const handleDownloadMultiQr = (slug: string, filename: string) => {
    const dataUri = multiQrDataUrls[slug];
    if (!dataUri) return;
    const a = document.createElement('a');
    a.href = dataUri;
    const safeName = (filename || slug).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `maketransfer-qr-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Real-time custom slug validator debounce
  const checkTimersRef = useRef<Record<string, any>>({});

  const validateSlugFor = (origSlug: string, newSlugVal: string) => {
    const trimmed = newSlugVal.trim();
    if (!trimmed) {
      setSlugCheckingState((prev) => ({
        ...prev,
        [origSlug]: { checking: false, available: false, error: 'Slug cannot be empty' },
      }));
      return;
    }

    if (trimmed.startsWith('/') || trimmed.endsWith('/') || trimmed.includes('//') || !/^[a-zA-Z0-9_/-]{3,64}$/.test(trimmed)) {
      setSlugCheckingState((prev) => ({
        ...prev,
        [origSlug]: {
          checking: false,
          available: false,
          error: 'Must be 3-64 characters with letters, numbers, dashes, underscores, or slashes',
        },
      }));
      return;
    }

    // If identical to current original slug, it's valid
    if (trimmed === origSlug) {
      setSlugCheckingState((prev) => ({
        ...prev,
        [origSlug]: { checking: false, available: true },
      }));
      return;
    }

    // Check if duplicate with another item in current session
    const duplicateInSession = Object.entries(itemConfigs).some(
      ([key, cfg]) => key !== origSlug && cfg.customSlug.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicateInSession) {
      setSlugCheckingState((prev) => ({
        ...prev,
        [origSlug]: { checking: false, available: false, error: 'Duplicate URL in this batch' },
      }));
      return;
    }

    // Debounce check against server
    setSlugCheckingState((prev) => ({
      ...prev,
      [origSlug]: { checking: true, available: null },
    }));

    if (checkTimersRef.current[origSlug]) {
      clearTimeout(checkTimersRef.current[origSlug]);
    }

    checkTimersRef.current[origSlug] = setTimeout(async () => {
      try {
        const avail = await checkSlugAvailability(trimmed);
        setSlugCheckingState((prev) => ({
          ...prev,
          [origSlug]: {
            checking: false,
            available: avail,
            error: avail ? undefined : 'URL slug is already taken',
          },
        }));
      } catch {
        setSlugCheckingState((prev) => ({
          ...prev,
          [origSlug]: { checking: false, available: true },
        }));
      }
    }, 350);
  };

  const handleUpdateItemConfig = (origSlug: string, updates: Partial<ItemConfig>) => {
    setItemConfigs((prev) => {
      const current = prev[origSlug] || {
        customSlug: origSlug,
        originalFilename: origSlug,
      };
      const updated = { ...current, ...updates };

      if (updates.customSlug !== undefined && updates.customSlug !== current.customSlug) {
        validateSlugFor(origSlug, updates.customSlug);
      }

      return {
        ...prev,
        [origSlug]: updated,
      };
    });
  };

  // Quick Action: Convert all filenames to clean slugs
  const handleAutoGenerateSlugsFromFilenames = () => {
    const newConfigs = { ...itemConfigs };
    const usedSlugs = new Set<string>();

    items.forEach((item) => {
      const filename = item.document?.originalFilename || item.slug;
      let baseSlug = cleanFilenameToSlug(filename) || 'doc';
      let candidate = baseSlug;
      let counter = 1;

      while (usedSlugs.has(candidate)) {
        candidate = `${baseSlug}-${counter}`;
        counter++;
      }
      usedSlugs.add(candidate);

      newConfigs[item.slug] = {
        ...(newConfigs[item.slug] || {}),
        customSlug: candidate,
      };
      validateSlugFor(item.slug, candidate);
    });

    setItemConfigs(newConfigs);
  };

  // Quick Action: Apply a batch prefix to all slugs
  const handleApplyBatchPrefix = () => {
    if (!batchPrefixText.trim()) {
      setBatchPrefixModalOpen(false);
      return;
    }
    const cleanPrefix = batchPrefixText.trim().toLowerCase().replace(/[^\w-]/g, '');
    const newConfigs = { ...itemConfigs };

    items.forEach((item) => {
      const currentSlug = newConfigs[item.slug]?.customSlug || item.slug;
      const stripped = currentSlug.replace(new RegExp(`^${cleanPrefix}-?`), '');
      const candidate = `${cleanPrefix}-${stripped}`.substring(0, 32);

      newConfigs[item.slug] = {
        ...(newConfigs[item.slug] || {}),
        customSlug: candidate,
      };
      validateSlugFor(item.slug, candidate);
    });

    setItemConfigs(newConfigs);
    setBatchPrefixModalOpen(false);
    setBatchPrefixText('');
  };

  // Quick Action: Reset all slugs to initial default random short slugs
  const handleResetSlugsToDefault = () => {
    const newConfigs = { ...itemConfigs };
    items.forEach((item) => {
      newConfigs[item.slug] = {
        ...(newConfigs[item.slug] || {}),
        customSlug: item.slug,
      };
      setSlugCheckingState((prev) => ({
        ...prev,
        [item.slug]: { checking: false, available: true },
      }));
    });
    setItemConfigs(newConfigs);
  };

  // Publish all batch items
  const handlePublishAll = async () => {
    // Check if any slug is invalid or taken
    for (const item of items) {
      const state = slugCheckingState[item.slug];
      if (state && state.available === false) {
        setPublishError(`Please fix invalid or duplicate custom URL for: ${itemConfigs[item.slug]?.customSlug}`);
        return;
      }
    }

    setIsPublishing(true);
    setPublishError(null);

    try {
      const batchItems = items.map((item) => {
        const config = itemConfigs[item.slug] || { customSlug: item.slug };
        const customSlugVal = config.customSlug?.trim();
        const itemPassword = config.password?.trim() || undefined;
        const itemExpiresIn = config.expiresIn !== 'inherit' ? config.expiresIn : undefined;
        const itemMaxDownloads = config.maxDownloads ? parseInt(config.maxDownloads, 10) : undefined;

        return {
          slug: item.slug,
          managementToken: item.managementToken,
          options: {
            customSlug: customSlugVal !== item.slug ? customSlugVal : undefined,
            password: itemPassword,
            expiresIn: itemExpiresIn,
            maxDownloads: itemMaxDownloads,
            description: config.description?.trim() || undefined,
          },
        };
      });

      const globalOptions: PublishRequest = {
        password: globalPassword.trim() || undefined,
        expiresIn: globalExpiresIn,
        maxDownloads: globalMaxDownloads ? parseInt(globalMaxDownloads, 10) : undefined,
      };

      const res = await publishBatch({
        items: batchItems,
        globalOptions,
      });

      if (res.items && res.items.length > 0) {
        setItems(res.items);
      }

      setIsPublished(true);
      setIsPublishing(false);
      setEditingItemSlug(null);

      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err: any) {
      setIsPublishing(false);
      setPublishError(err.message || 'Failed to publish all files');
    }
  };

  // Open live post-publish link editor
  const handleOpenPostPublishEdit = (item: UploadResponse) => {
    const doc = item.document;
    const currentSlug = doc?.slug || item.slug;
    setPostPublishEditSlug(currentSlug);
    setPostPublishForm({
      customSlug: currentSlug,
      originalFilename: doc?.originalFilename || item.slug,
      password: '',
      expiresIn: 'never',
      maxDownloads: doc?.maxDownloads ? String(doc.maxDownloads) : '',
      description: doc?.description || '',
    });
    setPostEditError(null);
    setPostEditSaveSuccess(null);
  };

  // Save changes to a published link
  const handleSavePostPublishEdit = async (origItem: UploadResponse) => {
    setIsSavingPostEdit(true);
    setPostEditError(null);
    setPostEditSaveSuccess(null);

    const oldSlug = origItem.document?.slug || origItem.slug;
    const newSlug = postPublishForm.customSlug.trim();

    try {
      if (newSlug !== oldSlug) {
        if (newSlug.startsWith('/') || newSlug.endsWith('/') || newSlug.includes('//') || !/^[a-zA-Z0-9_/-]{3,64}$/.test(newSlug)) {
          throw new Error('Custom URL must be 3-64 alphanumeric characters, dashes, underscores, or slashes.');
        }
        const avail = await checkSlugAvailability(newSlug);
        if (!avail) {
          throw new Error('This custom URL slug is already taken. Please choose another.');
        }
      }

      const updates: any = {
        customSlug: newSlug !== oldSlug ? newSlug : undefined,
        originalFilename: postPublishForm.originalFilename.trim() || undefined,
        description: postPublishForm.description.trim() || undefined,
        maxDownloads: postPublishForm.maxDownloads ? parseInt(postPublishForm.maxDownloads, 10) : null,
      };

      if (postPublishForm.password.trim().length > 0) {
        updates.password = postPublishForm.password.trim();
      }

      if (postPublishForm.expiresIn !== 'never') {
        const now = Date.now();
        if (postPublishForm.expiresIn === '1h') updates.expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
        else if (postPublishForm.expiresIn === '24h') updates.expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        else if (postPublishForm.expiresIn === '7d') updates.expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
        else if (postPublishForm.expiresIn === '30d') updates.expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const updatedDoc = await updateDocumentSettings(oldSlug, origItem.managementToken, updates);

      // Update state item
      setItems((prev) =>
        prev.map((it) => {
          const itSlug = it.document?.slug || it.slug;
          if (itSlug === oldSlug) {
            return {
              ...it,
              slug: updatedDoc.slug,
              document: updatedDoc,
            };
          }
          return it;
        })
      );

      // Local storage sync
      if (newSlug !== oldSlug) {
        removeMyUpload(oldSlug);
      }
      saveMyUpload({
        slug: updatedDoc.slug,
        managementToken: origItem.managementToken,
        originalFilename: updatedDoc.originalFilename,
        size: updatedDoc.size,
        uploadedAt: updatedDoc.uploadedAt,
        status: 'published',
      });

      setPostEditSaveSuccess('Link settings updated successfully!');
      setTimeout(() => {
        setPostPublishEditSlug(null);
        setPostEditSaveSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPostEditError(err.message || 'Failed to update link settings');
    } finally {
      setIsSavingPostEdit(false);
    }
  };

  const handleCopySingle = (slug: string) => {
    const url = `${baseUrl}/d/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  const handleCopyAll = () => {
    const formatted = items
      .map((item) => {
        const doc = item.document;
        const name = doc?.originalFilename || item.slug;
        const currentSlug = isPublished
          ? doc?.slug || item.slug
          : itemConfigs[item.slug]?.customSlug || item.slug;
        const url = `${baseUrl}/d/${currentSlug}`;
        return `${name}: ${url}`;
      })
      .join('\n');

    navigator.clipboard.writeText(formatted);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 3000);
  };

  const totalSize = items.reduce((acc, curr) => acc + (curr.document?.size || 0), 0);

  return (
    <div className="max-w-3xl mx-auto bg-white border border-stone-200/90 rounded-3xl shadow-sm p-6 sm:p-10 space-y-6">
      {/* Header */}
      {!isPublished ? (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Individual Links Hub
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            Publish & Customize {items.length} Separate Document Links
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Customize individual link URLs, passwords, and expiration below or publish immediately.
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-center py-2">
          <div className="w-14 h-14 bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-2xs">
            <CheckCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            {items.length} Links Published Successfully!
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 max-w-lg mx-auto">
            All files are live and shareable. You can copy links, view QR codes, or edit link settings at any time.
          </p>
        </div>
      )}

      {/* Published Copy All Banner */}
      {isPublished && (
        <div className="p-4 bg-stone-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">Ready to share all files?</p>
              <p className="text-xs text-stone-300">
                Copy all {items.length} links at once in a neat formatted list
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopyAll}
              className="flex items-center space-x-2 px-5 py-2.5 bg-white text-stone-900 hover:bg-stone-100 rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer shrink-0"
            >
              {copiedAll ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>All {items.length} Links Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy All Links</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Draft Stage: Batch Slug Editing & Link Customization Toolbar */}
      {!isPublished && (
        <div className="bg-stone-50/80 border border-stone-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Wand2 className="w-4 h-4 text-emerald-700" />
              <span className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Quick Link URL Actions
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoGenerateSlugsFromFilenames}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                title="Convert each filename to a clean URL slug"
              >
                <Tag className="w-3.5 h-3.5 text-stone-500" />
                <span>Slugs from Filenames</span>
              </button>

              <button
                type="button"
                onClick={() => setBatchPrefixModalOpen((p) => !p)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                title="Add a custom prefix to all slugs"
              >
                <Pencil className="w-3.5 h-3.5 text-stone-500" />
                <span>Add Prefix...</span>
              </button>

              <button
                type="button"
                onClick={handleResetSlugsToDefault}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-stone-100 text-stone-500 border border-stone-200 rounded-xl text-xs transition-colors cursor-pointer"
                title="Reset to random short links"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Inline Prefix Input Modal */}
          {batchPrefixModalOpen && (
            <div className="flex items-center gap-2 pt-2 border-t border-stone-200/80">
              <input
                type="text"
                value={batchPrefixText}
                onChange={(e) => setBatchPrefixText(e.target.value)}
                placeholder="e.g. project-x or client-a"
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-stone-500 font-mono"
              />
              <button
                onClick={handleApplyBatchPrefix}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Apply Prefix
              </button>
              <button
                onClick={() => setBatchPrefixModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Global Protection Toggle */}
          <div className="pt-2 border-t border-stone-200/80">
            <button
              type="button"
              onClick={() => setShowGlobalSettings((prev) => !prev)}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-stone-600" />
                <span className="text-xs font-bold text-stone-800">
                  Global Password & Expiration Settings (Applies to all files unless customized)
                </span>
              </div>
              {showGlobalSettings ? (
                <ChevronUp className="w-4 h-4 text-stone-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-stone-500" />
              )}
            </button>

            {showGlobalSettings && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-3 mt-2 border-t border-stone-200/60">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Batch Password
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={globalPassword}
                      onChange={(e) => setGlobalPassword(e.target.value)}
                      placeholder="Leave empty for public"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                    />
                    <Lock className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Batch Expiration
                  </label>
                  <select
                    value={globalExpiresIn}
                    onChange={(e) => setGlobalExpiresIn(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                  >
                    <option value="never">Never expires</option>
                    <option value="1h">1 Hour</option>
                    <option value="24h">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Max Downloads Limit
                  </label>
                  <input
                    type="number"
                    value={globalMaxDownloads}
                    onChange={(e) => setGlobalMaxDownloads(e.target.value)}
                    placeholder="Unlimited"
                    min={1}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Files List with Custom Link Previews & Inline Link Editing */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
          <span>
            {isPublished ? 'Published Links' : 'Configure Individual Links'} ({items.length})
          </span>
          <span>Total: {formatBytes(totalSize)}</span>
        </div>

        <div className="border border-stone-200 rounded-2xl divide-y divide-stone-100 bg-white overflow-hidden shadow-2xs">
          {items.map((item, idx) => {
            const doc = item.document;
            const originalFilename = doc?.originalFilename || item.slug;
            const ext = doc?.extension || originalFilename.split('.').pop() || 'bin';
            const colors = getFileCategoryColor(ext);

            // Determine active slug for this item
            const currentSlug = isPublished
              ? doc?.slug || item.slug
              : itemConfigs[item.slug]?.customSlug || item.slug;
            const shareUrl = `${baseUrl}/d/${currentSlug}`;
            const isItemCopied = copiedSlug === currentSlug;
            const isExpandedEditing = editingItemSlug === item.slug;
            const slugStatus = slugCheckingState[item.slug];
            const config = itemConfigs[item.slug] || { customSlug: item.slug };

            return (
              <div
                key={idx}
                className="transition-colors hover:bg-stone-50/60 p-4 sm:p-5 flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* File info */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div
                      className={`w-9 h-9 rounded-xl ${colors.bg} ${colors.text} ${colors.border} border flex items-center justify-center font-bold text-[10px] font-mono shrink-0`}
                    >
                      .{ext.substring(0, 4)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs sm:text-sm text-stone-900 truncate">
                        {config.originalFilename || originalFilename}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                        <span className="font-mono">{formatBytes(doc?.size || 0)}</span>
                        <span>•</span>
                        <div className="flex items-center space-x-1 font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
                          <LinkIcon className="w-3 h-3 shrink-0 text-emerald-600" />
                          <span className="truncate max-w-[200px] sm:max-w-xs">{shareUrl}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    {!isPublished ? (
                      /* Draft Stage: Edit Link Button */
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItemSlug(isExpandedEditing ? null : item.slug)
                        }
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          isExpandedEditing
                            ? 'bg-indigo-600 text-white'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200'
                        }`}
                        title="Edit link URL, slug & settings for this file"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{isExpandedEditing ? 'Done' : 'Edit Link'}</span>
                      </button>
                    ) : (
                      /* Published Stage: Copy, View, QR, Edit */
                      <>
                        <button
                          onClick={() => handleCopySingle(currentSlug)}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isItemCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 shadow-2xs'
                          }`}
                          title="Copy link"
                        >
                          {isItemCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onOpenViewer(currentSlug)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          title="Open Document Viewer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={() =>
                            setSelectedQrSlug(selectedQrSlug === currentSlug ? null : currentSlug)
                          }
                          className="p-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-xl text-xs transition-colors cursor-pointer"
                          title="Show QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenPostPublishEdit(item)}
                          className="p-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 rounded-xl text-xs transition-colors cursor-pointer"
                          title="Edit this published link (slug, password, expiration)"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Draft Stage: Expandable Link Editor Form */}
                {!isPublished && isExpandedEditing && (
                  <div className="mt-2 p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <Sliders className="w-3.5 h-3.5 text-stone-600" />
                        <span>Customize Link for "{originalFilename}"</span>
                      </span>
                      <button
                        onClick={() => setEditingItemSlug(null)}
                        className="text-stone-400 hover:text-stone-700 text-xs font-semibold cursor-pointer"
                      >
                        Close
                      </button>
                    </div>

                    {/* Custom Slug Input with Live Validation */}
                    <div>
                      <label className="block text-[11px] font-bold text-stone-700 mb-1">
                        Custom URL Slug
                      </label>
                      <div className="flex items-center rounded-xl bg-white border border-stone-300 focus-within:border-stone-500 overflow-hidden shadow-2xs">
                        <span className="px-3 py-2 text-xs text-stone-400 bg-stone-100 border-r border-stone-200 font-mono select-none">
                          {baseUrl}/d/
                        </span>
                        <input
                          type="text"
                          value={config.customSlug}
                          onChange={(e) =>
                            handleUpdateItemConfig(item.slug, { customSlug: e.target.value })
                          }
                          placeholder="e.g. quarterly-review"
                          className="flex-1 px-3 py-2 text-xs text-stone-900 bg-transparent focus:outline-none font-mono"
                        />
                        <div className="px-3">
                          {slugStatus?.checking ? (
                            <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin" />
                          ) : slugStatus?.available === true ? (
                            <span className="flex items-center text-[11px] text-emerald-600 font-medium">
                              <Check className="w-3.5 h-3.5 mr-1" /> Available
                            </span>
                          ) : slugStatus?.available === false ? (
                            <span className="flex items-center text-[11px] text-red-600 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 mr-1" />
                              {slugStatus.error || 'Taken'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Granular Individual Settings */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                          Document Title
                        </label>
                        <input
                          type="text"
                          value={config.originalFilename || originalFilename}
                          onChange={(e) =>
                            handleUpdateItemConfig(item.slug, { originalFilename: e.target.value })
                          }
                          placeholder="Display Name"
                          className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                          Specific Password
                        </label>
                        <input
                          type="password"
                          value={config.password || ''}
                          onChange={(e) =>
                            handleUpdateItemConfig(item.slug, { password: e.target.value })
                          }
                          placeholder={globalPassword ? 'Overrides global password' : 'Optional passkey'}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                          Expiration
                        </label>
                        <select
                          value={config.expiresIn || 'inherit'}
                          onChange={(e) =>
                            handleUpdateItemConfig(item.slug, { expiresIn: e.target.value })
                          }
                          className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:border-stone-400"
                        >
                          <option value="inherit">Inherit global setting ({globalExpiresIn})</option>
                          <option value="never">Never expires</option>
                          <option value="1h">1 Hour</option>
                          <option value="24h">24 Hours</option>
                          <option value="7d">7 Days</option>
                          <option value="30d">30 Days</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* QR Flyout if opened */}
                {selectedQrSlug === currentSlug && (
                  <div className="w-full pt-3 pb-2 border-t border-stone-200 flex flex-col items-center justify-center space-y-2.5 animate-in fade-in">
                    {multiQrDataUrls[currentSlug] ? (
                      <img
                        src={multiQrDataUrls[currentSlug]}
                        alt="QR Code"
                        className="w-36 h-36 border border-stone-200 rounded-2xl bg-white p-2 shadow-xs"
                      />
                    ) : (
                      <div className="w-36 h-36 border border-stone-200 rounded-2xl bg-stone-50 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                      </div>
                    )}
                    <p className="text-[11px] font-mono text-stone-500 truncate max-w-xs">{shareUrl}</p>
                    <button
                      type="button"
                      onClick={() => handleDownloadMultiQr(currentSlug, originalFilename)}
                      disabled={!multiQrDataUrls[currentSlug]}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download QR (.png)</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Post-Publish Live Link Editor Modal */}
      {postPublishEditSlug && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm sm:text-base">Edit Live Share Link</h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    /d/{postPublishEditSlug}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPostPublishEditSlug(null)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {postEditError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{postEditError}</span>
              </div>
            )}

            {postEditSaveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{postEditSaveSuccess}</span>
              </div>
            )}

            <div className="space-y-3.5">
              {/* Custom Slug */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  Custom URL Slug
                </label>
                <div className="flex items-center rounded-xl bg-stone-50 border border-stone-300 focus-within:border-stone-500 focus-within:bg-white overflow-hidden">
                  <span className="px-3 py-2 text-xs text-stone-400 bg-stone-100 border-r border-stone-200 font-mono select-none">
                    {baseUrl}/d/
                  </span>
                  <input
                    type="text"
                    value={postPublishForm.customSlug}
                    onChange={(e) =>
                      setPostPublishForm({ ...postPublishForm, customSlug: e.target.value })
                    }
                    className="flex-1 px-3 py-2 text-xs text-stone-900 bg-transparent focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={postPublishForm.originalFilename}
                  onChange={(e) =>
                    setPostPublishForm({ ...postPublishForm, originalFilename: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-stone-500 focus:bg-white"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  Passkey Protection
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={postPublishForm.password}
                    onChange={(e) =>
                      setPostPublishForm({ ...postPublishForm, password: e.target.value })
                    }
                    placeholder="Leave unchanged or enter new password"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-stone-500 focus:bg-white"
                  />
                  <Lock className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-2.5" />
                </div>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  Expiration Extension
                </label>
                <select
                  value={postPublishForm.expiresIn}
                  onChange={(e) =>
                    setPostPublishForm({ ...postPublishForm, expiresIn: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-stone-500 focus:bg-white"
                >
                  <option value="never">Keep current expiration</option>
                  <option value="1h">Extend by 1 Hour</option>
                  <option value="24h">Extend by 24 Hours</option>
                  <option value="7d">Extend by 7 Days</option>
                  <option value="30d">Extend by 30 Days</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-stone-100">
              <button
                onClick={() => setPostPublishEditSlug(null)}
                disabled={isSavingPostEdit}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              {(() => {
                const targetItem = items.find(
                  (it) => (it.document?.slug || it.slug) === postPublishEditSlug
                );
                return (
                  <button
                    onClick={() => targetItem && handleSavePostPublishEdit(targetItem)}
                    disabled={isSavingPostEdit || !targetItem}
                    className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    {isSavingPostEdit ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Link Changes</span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Error Notice */}
      {publishError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{publishError}</span>
        </div>
      )}

      {/* Action Footer */}
      {!isPublished ? (
        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          <button
            onClick={onCancel}
            disabled={isPublishing}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handlePublishAll}
            disabled={isPublishing}
            className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Publishing {items.length} Links...</span>
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4 text-emerald-300" />
                <span>Publish All {items.length} Separate Links</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-4 border-t border-stone-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
          >
            Upload More Files
          </button>

          <button
            onClick={() => onOpenViewer(items[0]?.document?.slug || items[0]?.slug)}
            className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <span>Preview First Document ({items[0]?.document?.originalFilename || 'Doc 1'})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
};
