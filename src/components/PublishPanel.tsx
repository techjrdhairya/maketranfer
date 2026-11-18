import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { DocumentMetadata, PublishRequest, UploadResponse } from '../types';
import { publishDocument, checkSlugAvailability, getServerInfo, ServerInfo, getEffectiveBaseUrl } from '../lib/api';
import { formatBytes, getFileCategoryColor } from '../lib/format';

interface PublishPanelProps {
  uploadData: UploadResponse;
  onOpenViewer: (slug: string) => void;
  onCancel: () => void;
}

const EXPIRY_OPTIONS = [
  { id: 'never', label: 'Never' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

export const PublishPanel: React.FC<PublishPanelProps> = ({ uploadData, onOpenViewer, onCancel }) => {
  const [doc, setDoc] = useState<DocumentMetadata>(uploadData.document);
  const [managementToken] = useState<string>(uploadData.managementToken);

  // Settings form
  const [customSlug, setCustomSlug] = useState(uploadData.document.slug);
  const [isSlugChecking, setIsSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(true);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expiresIn, setExpiresIn] = useState('never');
  const [maxDownloads, setMaxDownloads] = useState<string>('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Published state
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    getServerInfo().then((info) => {
      if (info) setServerInfo(info);
    });
  }, []);

  const effectiveBaseUrl = getEffectiveBaseUrl(serverInfo);
  const isLocalOrigin =
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [preferCloudUrl, setPreferCloudUrl] = useState(true);

  // On localhost default to the public URL so a copied link or QR code also works on other devices
  const baseUrl =
    isLocalOrigin && preferCloudUrl
      ? serverInfo?.cloudAppUrl || serverInfo?.sharedAppUrl || effectiveBaseUrl
      : typeof window !== 'undefined'
      ? window.location.origin
      : effectiveBaseUrl;

  const hostLabel = baseUrl.replace(/^https?:\/\//, '');
  const shareableUrl = `${baseUrl}/d/${doc.slug}`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';

  useEffect(() => {
    if (showQrCode && shareableUrl) {
      QRCode.toDataURL(shareableUrl, { width: 320, margin: 2, color: { dark: '#1c1917', light: '#ffffff' } })
        .then((url) => setQrDataUrl(url))
        .catch((e) => console.warn('QR code generation error:', e));
    }
  }, [showQrCode, shareableUrl]);

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const safeName = (doc.originalFilename || doc.slug).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `maketransfer-qr-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    if (customSlug && customSlug !== uploadData.document.slug) {
      setIsSlugChecking(true);
      const timer = setTimeout(async () => {
        const avail = await checkSlugAvailability(customSlug);
        setSlugAvailable(avail);
        setIsSlugChecking(false);
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setSlugAvailable(true);
      setIsSlugChecking(false);
    }
  }, [customSlug, uploadData.document.slug]);

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);

    const payload: PublishRequest = {
      description: description.trim() || undefined,
      password: password.trim() || undefined,
      expiresIn: expiresIn,
      maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : undefined,
      customSlug: customSlug !== uploadData.document.slug ? customSlug.trim() : undefined,
    };

    try {
      const res = await publishDocument(uploadData.document.slug, managementToken, payload);
      setDoc(res.document);
      setIsPublished(true);
      setIsPublishing(false);
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      setIsPublishing(false);
      setPublishError(err.message || 'Failed to publish document');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleNativeShare = async () => {
    try {
      await (navigator as any).share({
        title: doc.folderName || doc.originalFilename,
        text: `View "${doc.folderName || doc.originalFilename}" on MakeTransfer`,
        url: shareableUrl,
      });
    } catch {
      /* the person closed the share sheet */
    }
  };

  const colors = getFileCategoryColor(doc.extension);
  const name = doc.folderName || doc.originalFilename;

  return (
    <div className="max-w-2xl mx-auto w-full bg-white border border-stone-200/90 rounded-3xl shadow-sm p-5 sm:p-8 space-y-6">
      {/* Header */}
      {!isPublished ? (
        <div className="space-y-3">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Uploaded · not shared yet</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">Set up your link</h2>
            <p className="text-sm text-stone-500 mt-1">Adjust the options, or publish right away to get a link you can share.</p>
          </div>
        </div>
      ) : (
        <div className="text-center space-y-2 pt-1">
          <div className="relative w-16 h-16 mx-auto">
            <span className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40" />
            <span className="relative w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight pt-2">Your link is ready</h2>
          <p className="text-sm text-stone-500 max-w-sm mx-auto">Anyone with this link can view and download the file. No sign-up needed.</p>
        </div>
      )}

      {/* File summary */}
      <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/70 flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center font-bold text-[11px] font-mono shrink-0 ${
            doc.isFolder ? 'bg-amber-100 text-amber-800 border-amber-300' : `${colors.bg} ${colors.text} ${colors.border}`
          }`}
        >
          {doc.isFolder ? 'ZIP' : `.${(doc.extension || 'file').slice(0, 4)}`}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-stone-900 text-sm truncate">{name}</p>
          <p className="text-xs text-stone-500 mt-0.5 truncate">
            {formatBytes(doc.size)} ·{' '}
            {doc.isFolder ? `${doc.totalFiles || doc.items?.length || 'Several'} files in this folder` : `${doc.previewType} preview in the browser`}
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Scanned</span>
        </span>
      </div>

      {!isPublished ? (
        <div className="space-y-6">
          {/* Link address */}
          <div>
            <label htmlFor="custom-slug" className="block text-sm font-bold text-stone-800 mb-1.5">Link address</label>
            <div
              className={`flex items-center rounded-xl border bg-stone-50 overflow-hidden transition-all focus-within:bg-white focus-within:ring-2 ${
                slugAvailable === false ? 'border-red-300 focus-within:ring-red-500/15' : 'border-stone-300 focus-within:border-indigo-400 focus-within:ring-indigo-500/15'
              }`}
            >
              <span className="pl-3 pr-0.5 text-xs text-stone-400 font-mono select-none shrink-0 max-w-[50%] truncate">{hostLabel}/d/</span>
              <input
                id="custom-slug"
                type="text"
                value={customSlug}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9_/ -]/g, '').replace(/\s+/g, '-');
                  setCustomSlug(val);
                }}
                placeholder="project/my-file"
                maxLength={64}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent py-3 px-1 text-sm font-mono font-semibold text-stone-900 focus:outline-none"
              />
              <span className="pr-3 shrink-0">
                {isSlugChecking ? (
                  <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />
                ) : slugAvailable === false ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
              </span>
            </div>
            <p className={`mt-1.5 text-xs ${slugAvailable === false ? 'text-red-600 font-medium' : 'text-stone-400'}`}>
              {isSlugChecking
                ? 'Checking…'
                : slugAvailable === false
                ? 'That address is already taken. Try another.'
                : 'Letters, numbers, dashes and “/” are allowed, for example team/report.'}
            </p>
          </div>

          {/* Expiry */}
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-stone-800 mb-1.5">
              <Clock className="w-4 h-4 text-stone-400" />
              <span>Link expires</span>
            </p>
            <div role="radiogroup" aria-label="Link expiry" className="grid grid-cols-4 gap-1 p-1 bg-stone-100 rounded-xl">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={expiresIn === opt.id}
                  onClick={() => setExpiresIn(opt.id)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    expiresIn === opt.id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-stone-200' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="link-password" className="flex items-center gap-1.5 text-sm font-bold text-stone-800 mb-1.5">
              <Lock className="w-4 h-4 text-stone-400" />
              <span>Password</span>
              <span className="text-xs font-medium text-stone-400">optional</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                id="link-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty for open access"
                autoComplete="new-password"
                className="w-full pl-10 pr-11 py-3 text-sm bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-stone-400">People will need this password to open the file.</p>
          </div>

          {/* More options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-stone-500 hover:text-stone-900 font-semibold flex items-center gap-1 cursor-pointer"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>{showAdvanced ? 'Hide more options' : 'More options'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-4">
                <div>
                  <label htmlFor="link-note" className="block text-sm font-bold text-stone-800 mb-1.5">Note</label>
                  <input
                    id="link-note"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Blueprint v2 for client review"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <div>
                  <label htmlFor="link-max" className="block text-sm font-bold text-stone-800 mb-1.5">Download limit</label>
                  <input
                    id="link-max"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="1000"
                    value={maxDownloads}
                    onChange={(e) => setMaxDownloads(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  />
                  <p className="mt-1.5 text-xs text-stone-400">The link switches off after this many downloads.</p>
                </div>
              </div>
            )}
          </div>

          {publishError && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200">{publishError}</p>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-3 text-sm font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing || slugAvailable === false || isSlugChecking}
              className="flex items-center justify-center space-x-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Publish and get link</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Link card */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Share link</span>
              {isLocalOrigin && (
                <button
                  type="button"
                  onClick={() => setPreferCloudUrl(!preferCloudUrl)}
                  className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                >
                  {preferCloudUrl ? 'Using public URL' : 'Using localhost URL'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy link"
              className="w-full flex items-center gap-2.5 px-3.5 py-3 bg-white border border-stone-300 hover:border-indigo-300 rounded-xl text-left cursor-pointer transition-colors"
            >
              <Globe className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="flex-1 min-w-0 truncate font-mono text-[13px] font-semibold text-stone-900">{shareableUrl}</span>
            </button>

            <button
              onClick={handleCopyLink}
              className={`w-full flex items-center justify-center space-x-2 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                copiedLink ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20'
              }`}
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link copied' : 'Copy link'}</span>
            </button>
          </div>

          {/* Actions */}
          <div className={`grid gap-2.5 ${canNativeShare ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button
              onClick={() => onOpenViewer(doc.slug)}
              className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open</span>
            </button>
            <button
              onClick={() => setShowQrCode(!showQrCode)}
              aria-expanded={showQrCode}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 rounded-xl font-semibold text-xs sm:text-sm transition-colors cursor-pointer ${
                showQrCode ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR code</span>
            </button>
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
            )}
          </div>

          {showQrCode && (
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 text-center flex flex-col items-center space-y-3">
              <p className="text-sm text-stone-600 font-medium">Scan with a phone camera to open it</p>
              <div className="p-3 bg-white rounded-2xl shadow-xs border border-stone-200">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for this link" className="w-44 h-44 rounded-lg" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR (.png)</span>
              </button>
            </div>
          )}

          {/* Quick share */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-stone-400 mr-1">Send via</span>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`View "${name}": ${shareableUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Shared file: ${name}`)}&body=${encodeURIComponent(`Here is the link to view the file: ${shareableUrl}`)}`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full text-xs font-semibold transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this file on MakeTransfer: ${shareableUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-full text-xs font-semibold transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>X</span>
            </a>
          </div>

          <div className="pt-4 border-t border-stone-100 flex justify-center">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Upload another file</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
