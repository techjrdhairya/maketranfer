import React, { useEffect, useState } from 'react';
import { API_BASE } from '../lib/apiBase';
import {
  Download,
  Share2,
  Check,
  Eye,
  Calendar,
  Clock,
  HardDrive,
  ShieldCheck,
  Lock,
  ArrowLeft,
  FileText,
  Copy,
  Sparkles,
  Loader2,
  Monitor,
} from 'lucide-react';
import { DocumentMetadata } from '../types';
import { getDocumentMetadata, getAccessToken, getServerInfo, ServerInfo, getEffectiveBaseUrl } from '../lib/api';
import { formatBytes, formatDate, formatTimeRemaining, getFileCategoryColor } from '../lib/format';
import { PdfViewer } from './viewers/PdfViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { CodeTextViewer } from './viewers/CodeTextViewer';
import { DocxViewer } from './viewers/DocxViewer';
import { SpreadsheetViewer } from './viewers/SpreadsheetViewer';
import { MediaViewer } from './viewers/MediaViewer';
import { BinaryDownloadCard } from './viewers/BinaryDownloadCard';
import { FolderViewer } from './viewers/FolderViewer';
import { PasswordPrompt } from './PasswordPrompt';
import { ExpiredNotice } from './ExpiredNotice';
import { Logo } from './Logo';
import { DeviceAccessModal } from './DeviceAccessModal';

interface DocumentViewerProps {
  slug: string;
  onGoHome: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ slug, onGoHome }) => {
  const [doc, setDoc] = useState<DocumentMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken(slug));
  const [copiedLink, setCopiedLink] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  useEffect(() => {
    getServerInfo().then((info) => {
      if (info) setServerInfo(info);
    });
  }, []);

  // Auto-retry when network connection is restored
  useEffect(() => {
    const handleOnline = () => {
      setRetryCount((c) => c + 1);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    getDocumentMetadata(slug)
      .then((res) => {
        if (!isMounted) return;
        if (res.isExpired) {
          setIsExpired(true);
        }
        if (res.document) {
          setDoc(res.document);
        }
        setRequiresPassword(Boolean(res.requiresPassword));
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Could not find document');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [slug, retryCount]);

  const handlePasswordUnlocked = (token: string, updatedDoc: DocumentMetadata) => {
    setAccessToken(token);
    setDoc(updatedDoc);
    setRequiresPassword(false);
  };

  const handleCopyLink = () => {
    const effectiveBase = getEffectiveBaseUrl(serverInfo);
    const shareUrl = `${effectiveBase}/d/${slug}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-stone-900" />
        <p className="text-sm font-medium text-stone-600">Retrieving document...</p>
      </div>
    );
  }

  if (isExpired) {
    return <ExpiredNotice reason="expired" onGoHome={onGoHome} />;
  }

  if (error) {
    const isUnpublished = error.toLowerCase().includes('unpublished');
    const isNetwork =
      error.toLowerCase().includes('network') ||
      error.toLowerCase().includes('fetch') ||
      error.toLowerCase().includes('connection') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isNetwork) {
      return <ExpiredNotice reason="network_error" onGoHome={onGoHome} onRetry={() => setRetryCount((c) => c + 1)} />;
    }

    return (
      <ExpiredNotice
        reason={isUnpublished ? 'unpublished' : 'not_found'}
        onGoHome={onGoHome}
        onRetry={() => setRetryCount((c) => c + 1)}
      />
    );
  }

  if (!doc) {
    return (
      <ExpiredNotice
        reason="not_found"
        onGoHome={onGoHome}
        onRetry={() => setRetryCount((c) => c + 1)}
      />
    );
  }

  if (requiresPassword) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={onGoHome}
          className="inline-flex items-center space-x-1.5 text-xs text-stone-500 hover:text-stone-900 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to MakeTransfer</span>
        </button>
        <PasswordPrompt slug={slug} filename={doc.originalFilename} onUnlocked={handlePasswordUnlocked} />
      </div>
    );
  }

  const categoryColor = getFileCategoryColor(doc.extension);
  const downloadUrl = `${API_BASE}/api/files/${doc.slug}/download${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Breadcrumb & Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div className="flex items-center space-x-3">
          <button
            onClick={onGoHome}
            className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 rounded-xl transition-colors"
            title="Upload a new document"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center space-x-2">
            <span
              className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                doc.isFolder
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : `${categoryColor.bg} ${categoryColor.text} ${categoryColor.border}`
              } border uppercase`}
            >
              {doc.isFolder ? 'FOLDER BUNDLE' : `.${doc.extension}`}
            </span>
            <h1 className="text-base sm:text-lg font-bold text-stone-900 truncate max-w-sm sm:max-w-md md:max-w-xl">
              {doc.folderName || doc.originalFilename}
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setIsDeviceModalOpen(true)}
            title="Open on desktop CPU, monitor, ethernet, or other devices"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200/80 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <Monitor className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">Desktop Guide</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-medium transition-colors shadow-2xs"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
            <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
          </button>

          <a
            href={downloadUrl}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download ({formatBytes(doc.size)})</span>
          </a>
        </div>
      </div>

      {/* Metadata strip */}
      <div className="bg-white rounded-xl p-3.5 px-5 border border-stone-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs text-stone-600">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-stone-400" />
            <span>{formatBytes(doc.size)}</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <span>Uploaded {formatDate(doc.uploadedAt)}</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <Eye className="w-3.5 h-3.5 text-stone-400" />
            <span>{doc.viewCount.toLocaleString()} {doc.viewCount === 1 ? 'view' : 'views'}</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <Download className="w-3.5 h-3.5 text-stone-400" />
            <span>{doc.downloadCount.toLocaleString()} {doc.downloadCount === 1 ? 'download' : 'downloads'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {doc.expiresAt && (
            <div className="flex items-center space-x-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60 font-medium">
              <Clock className="w-3 h-3 text-amber-600" />
              <span>{formatTimeRemaining(doc.expiresAt)}</span>
            </div>
          )}

          {doc.hasPassword && (
            <div className="flex items-center space-x-1 text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md font-medium">
              <Lock className="w-3 h-3 text-stone-500" />
              <span>Protected</span>
            </div>
          )}

          {doc.scanStatus === 'clean' && (
            <div className="flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Verified Clean</span>
            </div>
          )}
        </div>
      </div>

      {doc.description && (
        <div className="bg-stone-50 border-l-4 border-stone-400 p-4 rounded-r-xl text-xs text-stone-700 leading-relaxed">
          <p className="font-semibold text-stone-900 mb-0.5">Author Note:</p>
          <p>{doc.description}</p>
        </div>
      )}

      {/* Dynamic In-Browser Viewer */}
      <div className="w-full">
        {doc.previewType === 'folder' || doc.isFolder ? (
          <FolderViewer document={doc} accessToken={accessToken} />
        ) : (
          <>
            {doc.previewType === 'pdf' && <PdfViewer slug={doc.slug} filename={doc.originalFilename} accessToken={accessToken} />}
            {doc.previewType === 'image' && <ImageViewer slug={doc.slug} filename={doc.originalFilename} accessToken={accessToken} />}
            {doc.previewType === 'markdown' && <MarkdownViewer slug={doc.slug} filename={doc.originalFilename} accessToken={accessToken} />}
            {doc.previewType === 'text' && (
              <CodeTextViewer slug={doc.slug} filename={doc.originalFilename} extension={doc.extension} accessToken={accessToken} />
            )}
            {doc.previewType === 'docx' && <DocxViewer slug={doc.slug} filename={doc.originalFilename} accessToken={accessToken} />}
            {doc.previewType === 'spreadsheet' && (
              <SpreadsheetViewer slug={doc.slug} filename={doc.originalFilename} accessToken={accessToken} />
            )}
            {(doc.previewType === 'audio' || doc.previewType === 'video') && (
              <MediaViewer slug={doc.slug} filename={doc.originalFilename} type={doc.previewType} accessToken={accessToken} />
            )}
            {doc.previewType === 'binary' && <BinaryDownloadCard document={doc} accessToken={accessToken} />}
          </>
        )}
      </div>

      {/* Bottom CTA to upload own documents */}
      <div className="mt-12 p-6 bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center p-2 text-white shrink-0 shadow-2xs">
            <Logo className="w-full h-full text-white" />
          </div>
          <div>
            <h3 className="font-bold text-base flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Share any document instantly with MakeTransfer
            </h3>
            <p className="text-xs text-stone-300 mt-1">
              Built by <strong>Dhairya Agrawal</strong> • Collision-safe public links, in-browser previews for PDFs/images/docs.
            </p>
          </div>
        </div>
        <button
          onClick={onGoHome}
          className="whitespace-nowrap px-5 py-2.5 bg-white text-stone-950 font-bold rounded-xl text-xs hover:bg-stone-100 transition-colors shadow-xs"
        >
          Upload Your File
        </button>
      </div>

      {/* Cross-Device / Desktop CPU Monitor Access Modal */}
      <DeviceAccessModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        documentSlug={slug}
        documentTitle={doc.folderName || doc.originalFilename}
      />
    </div>
  );
};
