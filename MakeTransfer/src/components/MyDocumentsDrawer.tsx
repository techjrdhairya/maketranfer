import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Eye,
  Download,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Lock,
  FileText,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertTriangle,
  Cloud,
  User,
  Sparkles,
  QrCode,
  Share2,
  Monitor,
} from 'lucide-react';
import { DocumentMetadata, MyUploadItem } from '../types';
import {
  fetchMyDocuments,
  getMyUploads,
  updateDocumentSettings,
  deleteDocument,
  removeMyUpload,
  deleteAllMyDocuments,
  getServerInfo,
  ServerInfo,
  getEffectiveBaseUrl,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { auth, deleteUserDocFromCloud, deleteAllUserDocsFromCloud } from '../lib/firebase';
import { Logo } from './Logo';
import { formatBytes, formatDate, formatTimeRemaining, getFileCategoryColor } from '../lib/format';
import { DeviceAccessModal } from './DeviceAccessModal';

interface MyDocumentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDocument: (slug: string) => void;
}

export const MyDocumentsDrawer: React.FC<MyDocumentsDrawerProps> = ({
  isOpen,
  onClose,
  onOpenDocument,
}) => {
  const { user, isGuest, setShowAuthModal } = useAuth();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const isDeletingAllRef = React.useRef(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [qrModalDoc, setQrModalDoc] = useState<DocumentMetadata | null>(null);
  const [modalQrDataUrl, setModalQrDataUrl] = useState<string>('');
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [selectedDeviceDoc, setSelectedDeviceDoc] = useState<DocumentMetadata | null>(null);

  useEffect(() => {
    if (isOpen) {
      getServerInfo().then((info) => {
        if (info) setServerInfo(info);
      });
    }
  }, [isOpen]);

  const effectiveBaseUrl = getEffectiveBaseUrl(serverInfo);

  useEffect(() => {
    if (qrModalDoc) {
      const url = `${effectiveBaseUrl}/d/${qrModalDoc.slug}`;
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1c1917',
          light: '#ffffff',
        },
      })
        .then((dataUri) => setModalQrDataUrl(dataUri))
        .catch((err) => console.warn('QR generation error:', err));
    } else {
      setModalQrDataUrl('');
    }
  }, [qrModalDoc, effectiveBaseUrl]);

  const handleDownloadModalQr = () => {
    if (!modalQrDataUrl || !qrModalDoc) return;
    const a = document.createElement('a');
    a.href = modalQrDataUrl;
    const safeName = (qrModalDoc.originalFilename || qrModalDoc.slug).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `maketransfer-qr-${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const loadDocs = async () => {
    setLoading(true);
    const docs = await fetchMyDocuments();
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadDocs();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (isDeletingAllRef.current) return;
      if (isOpen) {
        if (e?.detail && Array.isArray(e.detail) && e.detail.length === 0) {
          setDocuments([]);
        } else {
          loadDocs();
        }
      }
    };
    window.addEventListener('maketransfer:uploads_updated', handleUpdate);
    window.addEventListener('docshare:uploads_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('maketransfer:uploads_updated', handleUpdate);
      window.removeEventListener('docshare:uploads_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (slug: string) => {
    const url = `${effectiveBaseUrl}/d/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleToggleStatus = async (doc: DocumentMetadata) => {
    const localItems = getMyUploads();
    const match = localItems.find((x) => x.slug === doc.slug);
    const token = doc.managementToken || match?.managementToken;
    if (!token) return;

    setActionLoading(doc.slug);
    const newStatus = doc.status === 'published' ? 'unpublished' : 'published';
    try {
      const updated = await updateDocumentSettings(doc.slug, token, {
        status: newStatus,
      });
      setDocuments((prev) => prev.map((d) => (d.slug === doc.slug ? { ...d, ...updated, managementToken: token } : d)));
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Are you sure you want to permanently delete this document and disable its link?')) {
      return;
    }
    const localItems = getMyUploads();
    const match = localItems.find((x) => x.slug === slug);
    const doc = documents.find((x) => x.slug === slug);
    const token = doc?.managementToken || match?.managementToken || '';

    setActionLoading(slug);
    try {
      await deleteDocument(slug, token);
      if (user) {
        try {
          await deleteUserDocFromCloud(user.uid, slug);
        } catch (e) {
          console.warn('Could not delete from Firestore cloud:', e);
        }
      }
      setDocuments((prev) => prev.filter((d) => d.slug !== slug));
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAll = async () => {
    if (documents.length === 0) return;
    setIsDeletingAll(true);
    isDeletingAllRef.current = true;
    const docsToDelete = [...documents];
    setDocuments([]);
    setShowDeleteAllConfirm(false);

    try {
      const currentUid = user?.uid || auth.currentUser?.uid;
      const cloudDeletePromise = currentUid
        ? deleteAllUserDocsFromCloud(currentUid, docsToDelete.map((d) => d.slug))
        : Promise.resolve();

      await Promise.allSettled([
        deleteAllMyDocuments(docsToDelete),
        cloudDeletePromise,
      ]);
    } catch (err: any) {
      console.error('Delete all error:', err);
      // Reload on failure so UI remains accurate
      loadDocs();
      alert(err.message || 'Failed to delete all documents');
    } finally {
      setIsDeletingAll(false);
      setTimeout(() => {
        isDeletingAllRef.current = false;
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-stone-200">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white p-1.5 shadow-2xs">
              <Logo className="w-full h-full text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">My Uploaded Documents</h2>
              <p className="text-xs text-stone-500">Manage links, track analytics, and unpublish</p>
            </div>
          </div>
          <button
            id="btn-close-my-documents"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Sync Status Banner */}
        <div className="px-6 py-2.5 bg-stone-50 border-b border-stone-200">
          {user ? (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-stone-600 font-medium truncate max-w-[240px]">
                  Synced to <strong className="text-stone-900">{user.email}</strong>
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                Cloud Synced
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/80">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-[11px] text-amber-900 leading-tight">
                  <strong>Guest Mode:</strong> Files saved locally in this browser.
                </span>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="shrink-0 ml-2 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold hover:bg-stone-800 transition-colors shadow-2xs cursor-pointer"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Desktop CPU & Cross-Device Access Banner */}
        <div className="px-6 py-2 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-emerald-950">
            <Monitor className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="text-[11px] font-medium">Opening on a Desktop CPU with Monitor?</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedDeviceDoc(null);
              setIsDeviceModalOpen(true);
            }}
            className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
          >
            Connection Guide
          </button>
        </div>

        {/* Toolbar & Delete All Action */}
        {!loading && documents.length > 0 && (
          <div className="px-6 py-2.5 bg-stone-100/70 border-b border-stone-200/90 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-stone-700">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} saved
            </span>
            <button
              id="btn-delete-all-uploads"
              onClick={() => setShowDeleteAllConfirm(true)}
              disabled={isDeletingAll}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 hover:text-red-800 rounded-lg font-bold text-xs transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          </div>
        )}

        {/* Delete All Confirmation Dialog */}
        {showDeleteAllConfirm && (
          <div className="mx-6 mt-4 p-4 bg-red-50/90 border border-red-200 rounded-2xl animate-in fade-in zoom-in-95 space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-red-950">Delete all {documents.length} uploaded documents?</h4>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  This will permanently delete all files from the server, disable their public links, and wipe your browser history. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                id="btn-cancel-delete-all"
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={isDeletingAll}
                className="px-3 py-1.5 bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-all"
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
              >
                {isDeletingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
              <p className="text-xs">Loading your documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-20 text-stone-500 space-y-3">
              <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto text-stone-400">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-stone-700">No uploads saved yet</p>
              <p className="text-xs text-stone-400 max-w-xs mx-auto">
                Documents you upload in this browser will be listed here with real-time stats and management controls.
              </p>
            </div>
          ) : (
            documents.map((doc) => {
              const colors = getFileCategoryColor(doc.extension);
              const isWorking = actionLoading === doc.slug;

              return (
                <div
                  key={doc.slug}
                  className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3 hover:border-stone-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 truncate">
                      <div
                        className={`w-8 h-8 rounded-lg ${
                          doc.isFolder
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : `${colors.bg} ${colors.text} ${colors.border}`
                        } border flex items-center justify-center font-bold text-[10px] font-mono shrink-0`}
                      >
                        {doc.isFolder ? 'ZIP' : `.${doc.extension}`}
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-xs text-stone-900 truncate">
                          {doc.folderName || doc.originalFilename}
                        </p>
                        <p className="text-[11px] text-stone-500 flex items-center space-x-1.5 mt-0.5">
                          <span>{formatBytes(doc.size)}</span>
                          <span>•</span>
                          {doc.isFolder ? (
                            <span>{doc.totalFiles || doc.items?.length || ''} files</span>
                          ) : (
                            <span>{formatDate(doc.uploadedAt)}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        doc.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                          : doc.status === 'draft'
                          ? 'bg-amber-50 text-amber-700 border-amber-200/70'
                          : 'bg-stone-100 text-stone-600 border-stone-200'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center justify-between text-xs text-stone-500 bg-stone-50 px-3 py-2 rounded-xl border border-stone-200/60">
                    <div className="flex items-center space-x-4">
                      <span className="flex items-center space-x-1 font-mono">
                        <Eye className="w-3.5 h-3.5 text-stone-400" />
                        <span>{doc.viewCount || 0}</span>
                      </span>
                      <span className="flex items-center space-x-1 font-mono">
                        <Download className="w-3.5 h-3.5 text-stone-400" />
                        <span>{doc.downloadCount || 0}</span>
                      </span>
                    </div>

                    {doc.expiresAt && (
                      <span className="text-[11px] text-amber-700 flex items-center space-x-1 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeRemaining(doc.expiresAt)}</span>
                      </span>
                    )}

                    {doc.hasPassword && (
                      <span className="text-[11px] text-stone-700 flex items-center space-x-1">
                        <Lock className="w-3 h-3" />
                        <span>Password</span>
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          onOpenDocument(doc.slug);
                          onClose();
                        }}
                        className="flex items-center space-x-1 text-stone-700 hover:text-stone-950 font-semibold hover:underline cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>

                      <button
                        onClick={() => handleCopy(doc.slug)}
                        className="flex items-center space-x-1 text-stone-600 hover:text-stone-900 cursor-pointer"
                        title="Copy shareable link"
                      >
                        {copiedSlug === doc.slug ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedSlug === doc.slug ? 'Copied' : 'Link'}</span>
                      </button>

                      <button
                        onClick={() => setQrModalDoc(doc)}
                        className="flex items-center space-x-1 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                        title="Show & download QR code"
                      >
                        <QrCode className="w-3.5 h-3.5 text-stone-600" />
                        <span>QR</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        disabled={isWorking}
                        onClick={() => handleToggleStatus(doc)}
                        className="text-[11px] font-medium text-stone-600 hover:text-stone-900 underline cursor-pointer"
                      >
                        {doc.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>

                      <button
                        disabled={isWorking}
                        onClick={() => handleDelete(doc.slug)}
                        className="p-1 text-stone-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* QR Code Modal for viewing and downloading high-res QR code */}
        {qrModalDoc && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-stone-900 text-sm">Document QR Code</h3>
                </div>
                <button
                  onClick={() => setQrModalDoc(null)}
                  className="p-1 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-xs text-stone-900 truncate">
                  {qrModalDoc.folderName || qrModalDoc.originalFilename}
                </p>
                <p className="text-[11px] font-mono text-stone-500 truncate">
                  {window.location.origin}/d/{qrModalDoc.slug}
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex justify-center items-center shadow-inner">
                {modalQrDataUrl ? (
                  <img
                    src={modalQrDataUrl}
                    alt="Document QR Code"
                    className="w-44 h-44 rounded-xl bg-white p-2 shadow-xs border border-stone-200"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadModalQr}
                  disabled={!modalQrDataUrl}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download QR Code (.png)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleCopy(qrModalDoc.slug);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copiedSlug === qrModalDoc.slug ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Document Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 text-center space-y-1">
          <p className="text-[11px] text-stone-600 font-medium">
            MakeTransfer • Owned by <strong className="text-stone-900 font-bold">Dhairya Agrawal</strong>
          </p>
          <p className="text-[10px] text-stone-400">
            Files and management keys are stored securely on the server.
          </p>
        </div>
      </div>

      {/* Cross-Device / Desktop CPU Monitor Access Guide Modal */}
      <DeviceAccessModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        documentSlug={selectedDeviceDoc?.slug}
        documentTitle={selectedDeviceDoc?.originalFilename}
      />
    </div>
  );
};
