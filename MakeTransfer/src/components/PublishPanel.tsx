import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  Clock,
  HardDrive,
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
  Download,
  Monitor,
} from 'lucide-react';
import { DocumentMetadata, PublishRequest, UploadResponse } from '../types';
import { publishDocument, checkSlugAvailability, getServerInfo, ServerInfo, getEffectiveBaseUrl } from '../lib/api';
import { formatBytes, getFileCategoryColor } from '../lib/format';
import { DeviceAccessModal } from './DeviceAccessModal';

interface PublishPanelProps {
  uploadData: UploadResponse;
  onOpenViewer: (slug: string) => void;
  onCancel: () => void;
}

export const PublishPanel: React.FC<PublishPanelProps> = ({ uploadData, onOpenViewer, onCancel }) => {
  const [doc, setDoc] = useState<DocumentMetadata>(uploadData.document);
  const [managementToken] = useState<string>(uploadData.managementToken);

  // Settings form
  const [customSlug, setCustomSlug] = useState(uploadData.document.slug);
  const [isSlugChecking, setIsSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(true);

  const [password, setPassword] = useState('');
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
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');

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

  // If on localhost, default to the public cloud URL so copying or scanning works on other computers/monitors
  const baseUrl =
    isLocalOrigin && preferCloudUrl
      ? serverInfo?.cloudAppUrl || serverInfo?.sharedAppUrl || effectiveBaseUrl
      : typeof window !== 'undefined'
      ? window.location.origin
      : effectiveBaseUrl;

  const shareableUrl = `${baseUrl}/d/${doc.slug}`;

  useEffect(() => {
    if (showQrCode && shareableUrl) {
      QRCode.toDataURL(shareableUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1c1917',
          light: '#ffffff',
        },
      })
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

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err: any) {
      setIsPublishing(false);
      setPublishError(err.message || 'Failed to publish document');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const colors = getFileCategoryColor(doc.extension);

  return (
    <div className="max-w-2xl mx-auto bg-white border border-stone-200/90 rounded-3xl shadow-sm p-6 sm:p-10 space-y-6">
      {/* Top status indicator */}
      {!isPublished ? (
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Draft Upload Ready
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            Publish & Generate Shareable Link
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Customize options below or publish immediately to get your public link.
          </p>
        </div>
      ) : (
        <div className="space-y-1 text-center py-2">
          <div className="w-14 h-14 bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
            <Check className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
            Document Published Successfully!
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto">
            Anyone with this link can view and download your document. No sign-up required.
          </p>
        </div>
      )}

      {/* File metadata summary card */}
      <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/70 flex items-center justify-between">
        <div className="flex items-center space-x-3 truncate">
          <div
            className={`w-10 h-10 rounded-xl ${
              doc.isFolder
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : `${colors.bg} ${colors.text} ${colors.border}`
            } border flex items-center justify-center font-bold text-xs font-mono shrink-0`}
          >
            {doc.isFolder ? 'ZIP' : `.${doc.extension}`}
          </div>
          <div className="truncate">
            <p className="font-semibold text-stone-900 text-xs sm:text-sm truncate">
              {doc.folderName || doc.originalFilename}
            </p>
            <p className="text-[11px] text-stone-500 flex items-center space-x-2 mt-0.5">
              <span>{formatBytes(doc.size)}</span>
              <span>•</span>
              {doc.isFolder ? (
                <span>{doc.totalFiles || doc.items?.length || 'Bundle'} files in folder</span>
              ) : (
                <span className="capitalize">{doc.previewType} in-browser preview</span>
              )}
            </p>
          </div>
        </div>

        <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Clean</span>
        </span>
      </div>

      {!isPublished ? (
        /* Configuration Form */
        <div className="space-y-5">
          {/* Custom Slug Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-stone-700">
                Custom Link Path (Sub-paths & "/" Allowed)
              </label>
              <span className="text-[11px] text-stone-400">e.g. docs/report or team/v1</span>
            </div>
            <div className="flex items-center rounded-xl border border-stone-300 bg-stone-50 px-3 focus-within:border-stone-900 focus-within:ring-2 focus-within:ring-stone-900/10 transition-all">
              <span className="text-xs text-stone-400 font-mono select-none">{baseUrl}/d/</span>
              <input
                type="text"
                value={customSlug}
                onChange={(e) => {
                  // Allow letters, numbers, dashes, underscores, and single slashes
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9_/ -]/g, '').replace(/\s+/g, '-');
                  setCustomSlug(val);
                }}
                placeholder="project/my-file"
                maxLength={64}
                className="flex-1 bg-transparent py-2.5 px-1 text-xs font-mono font-semibold text-stone-900 focus:outline-none"
              />
              {isSlugChecking ? (
                <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />
              ) : slugAvailable === true ? (
                <span className="text-[11px] text-emerald-600 font-medium">Available</span>
              ) : (
                <span className="text-[11px] text-red-600 font-medium">Taken</span>
              )}
            </div>
          </div>

          {/* Quick Expiration selector */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-stone-500" /> Link Expiration
              </span>
              <span className="text-[11px] text-stone-400 font-normal">Auto-deactivates after time</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'never', label: 'Never' },
                { id: '24h', label: '24 Hours' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setExpiresIn(opt.id)}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${
                    expiresIn === opt.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Password toggle / input */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-stone-500" /> Password Protection (Optional)
              </span>
              <span className="text-[11px] text-stone-400 font-normal">Requires passkey to view</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for public open access"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-stone-50 border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10"
              />
            </div>
          </div>

          {/* Advanced toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-stone-500 hover:text-stone-900 font-medium flex items-center gap-1"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showAdvanced ? 'Hide advanced settings' : 'More options (note, download limit)'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 p-4 bg-stone-50/70 border border-stone-200/80 rounded-2xl space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Document Note or Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Project blueprint v2 for client review"
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:border-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1 flex items-center justify-between">
                    <span>Max Download Limit</span>
                    <span className="text-[11px] text-stone-400 font-normal">Deactivates after N downloads</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={maxDownloads}
                    onChange={(e) => setMaxDownloads(e.target.value)}
                    placeholder="e.g. 10 (unlimited if empty)"
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:border-stone-900"
                  />
                </div>
              </div>
            )}
          </div>

          {publishError && (
            <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
              {publishError}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing || slugAvailable === false}
              className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white rounded-xl font-bold text-xs shadow-xs transition-all"
            >
              {isPublishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Publish & Get Shareable Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Published Link Display Screen */
        <div className="space-y-6">
          {/* Primary Share Box */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/90 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Your Public Share Link
              </label>
              {isLocalOrigin && (
                <button
                  type="button"
                  onClick={() => setPreferCloudUrl(!preferCloudUrl)}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                >
                  {preferCloudUrl ? 'Using Public Cloud URL' : 'Using Localhost URL'}
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareableUrl}
                className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold text-stone-900 bg-white border border-stone-300 rounded-xl focus:outline-none select-all"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs shrink-0"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-stone-500 flex items-center gap-1.5 pt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>
                Permanent link: stays accessible across phones, desktops, and even when your laptop is turned off.
              </span>
            </p>
          </div>

          {/* Desktop CPU & Cross-Device Access Notice Banner */}
          <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5 text-emerald-950">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-800">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold">Opening on a Desktop CPU with monitor or Ethernet?</p>
                <p className="text-[11px] text-emerald-700">
                  Avoid &quot;Site can&apos;t be reached&quot; errors by using the cross-device guide &amp; cloud link.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDeviceModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-2xs cursor-pointer"
            >
              Device Guide
            </button>
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onOpenViewer(doc.slug)}
              className="flex items-center justify-center space-x-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Document Viewer</span>
            </button>

            <button
              onClick={() => setShowQrCode(!showQrCode)}
              className="flex items-center justify-center space-x-2 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-semibold text-xs transition-colors"
            >
              <QrCode className="w-4 h-4 text-stone-600" />
              <span>{showQrCode ? 'Hide QR Code' : 'Show QR Code'}</span>
            </button>
          </div>

          {/* QR Code view */}
          {showQrCode && (
            <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 text-center flex flex-col items-center space-y-3">
              <p className="text-xs text-stone-600 font-medium">Scan with camera to open instantly</p>
              <div className="p-3 bg-white rounded-2xl shadow-xs border border-stone-200">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Document QR Code"
                    className="w-40 h-40 rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                  </div>
                )}
              </div>
              <p className="text-[11px] font-mono text-stone-400 truncate max-w-xs">{shareableUrl}</p>
              <button
                type="button"
                onClick={handleDownloadQr}
                disabled={!qrDataUrl}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download QR Code (.png)</span>
              </button>
            </div>
          )}

          {/* Quick share options */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/80 text-xs text-stone-500">
            <span>Share directly via:</span>
            <div className="flex items-center space-x-2">
              <a
                href={`mailto:?subject=${encodeURIComponent(`Shared document: ${doc.originalFilename}`)}&body=${encodeURIComponent(`Here is the link to view the document: ${shareableUrl}`)}`}
                className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors font-medium"
              >
                Email
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`View document "${doc.originalFilename}": ${shareableUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors font-medium"
              >
                WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this document on MakeTransfer: ${shareableUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition-colors font-medium"
              >
                X / Twitter
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Device / Desktop CPU Monitor Access Guide Modal */}
      <DeviceAccessModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        documentSlug={doc.slug}
        documentTitle={doc.originalFilename}
      />
    </div>
  );
};
