import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Cpu,
  Wifi,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  X,
  Globe,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { getServerInfo, ServerInfo, getEffectiveBaseUrl } from '../lib/api';

interface DeviceAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentSlug?: string | null;
  documentTitle?: string | null;
}

export const DeviceAccessModal: React.FC<DeviceAccessModalProps> = ({
  isOpen,
  onClose,
  documentSlug,
  documentTitle,
}) => {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedDocUrl, setCopiedDocUrl] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      getServerInfo().then((info) => {
        if (info) setServerInfo(info);
      });
    }
  }, [isOpen]);

  const publicBaseUrl = getEffectiveBaseUrl(serverInfo);
  const publicAppUrl = serverInfo?.cloudAppUrl || serverInfo?.sharedAppUrl || publicBaseUrl;
  const targetDocUrl = documentSlug ? `${publicAppUrl}/d/${documentSlug}` : null;
  const activeShareUrl = targetDocUrl || publicAppUrl;

  useEffect(() => {
    if (isOpen && activeShareUrl) {
      QRCode.toDataURL(activeShareUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1c1917',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR generation error:', err));
    }
  }, [isOpen, activeShareUrl]);

  if (!isOpen) return null;

  const handleCopyAppUrl = () => {
    navigator.clipboard.writeText(publicAppUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyDocUrl = () => {
    if (!targetDocUrl) return;
    navigator.clipboard.writeText(targetDocUrl);
    setCopiedDocUrl(true);
    setTimeout(() => setCopiedDocUrl(false), 2000);
  };

  return (
    <div
      id="device-access-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="device-access-modal-card"
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-stone-900">Desktop & Cross-Device Access</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 rounded-full">
                  Ethernet / LAN / Web
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Opening on a desktop CPU with a display monitor, laptop, or phone
              </p>
            </div>
          </div>
          <button
            id="close-device-access-modal-button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Active Document Link if specific doc is open */}
          {targetDocUrl && (
            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                  Document Link for Desktop Monitor
                </span>
                {documentTitle && (
                  <span className="text-xs text-amber-800 font-medium truncate max-w-[200px]">
                    {documentTitle}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  value={targetDocUrl}
                  className="flex-1 px-3 py-2 text-xs font-mono font-semibold text-stone-900 bg-white border border-amber-300 rounded-lg select-all"
                />
                <button
                  id="copy-doc-desktop-url-button"
                  onClick={handleCopyDocUrl}
                  className="px-3.5 py-2 bg-amber-900 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shrink-0 shadow-2xs"
                >
                  {copiedDocUrl ? <Check className="w-3.5 h-3.5 text-amber-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDocUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Public Web Application URL */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-stone-500" />
                <span>Public Web App URL (Works on any PC / Monitor)</span>
              </span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200/50">
                HTTPS Ready
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={publicAppUrl}
                className="flex-1 px-3.5 py-2 text-xs font-mono font-semibold text-stone-900 bg-white border border-stone-300 rounded-lg select-all"
              />
              <button
                id="copy-public-app-url-button"
                onClick={handleCopyAppUrl}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shrink-0 shadow-2xs"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copied!' : 'Copy'}</span>
              </button>
              <a
                href={publicAppUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-xs font-semibold flex items-center transition-colors shrink-0"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* QR Code Quick Scanner */}
          <div>
            <button
              onClick={() => setShowQr(!showQr)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold transition-colors"
            >
              <div className="flex items-center space-x-2">
                <QrCode className="w-4 h-4 text-stone-600" />
                <span>{showQr ? 'Hide Quick QR Code' : 'Scan QR Code from Phone / Monitor'}</span>
              </div>
              <span className="text-[11px] text-stone-500 font-normal">
                {showQr ? 'Click to collapse' : 'Click to show'}
              </span>
            </button>

            {showQr && (
              <div className="mt-3 p-4 bg-stone-50 rounded-xl border border-stone-200 text-center flex flex-col items-center space-y-2">
                <p className="text-xs text-stone-600 font-medium">
                  Scan to open this exact application on any device
                </p>
                <div className="p-3 bg-white rounded-xl shadow-xs border border-stone-200">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Device Access QR"
                      className="w-36 h-36 rounded-md"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center text-xs text-stone-400">
                      Generating QR...
                    </div>
                  )}
                </div>
                <p className="text-[10px] font-mono text-stone-400 truncate max-w-sm">
                  {activeShareUrl}
                </p>
              </div>
            )}
          </div>

          {/* Troubleshooting "Site Can't Be Reached" */}
          <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200/80 space-y-3">
            <div className="flex items-center space-x-2 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Why does it say &quot;This site can&apos;t be reached&quot; on your Desktop CPU?
              </h4>
            </div>

            <div className="space-y-2 text-xs text-stone-700 leading-relaxed">
              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-rose-100">
                <span className="font-bold text-rose-600 text-sm leading-none shrink-0 mt-0.5">1.</span>
                <div>
                  <strong className="text-stone-900">Do NOT use &quot;localhost:3000&quot; on your desktop PC</strong>
                  <p className="text-stone-600 mt-0.5">
                    &quot;localhost&quot; only refers to the specific computer running the code. On your desktop CPU with monitor, typing &quot;localhost&quot; asks the desktop itself for the app, which refuses connection. Always use the <strong>Public Web App URL</strong> shown above.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-rose-100">
                <span className="font-bold text-rose-600 text-sm leading-none shrink-0 mt-0.5">2.</span>
                <div>
                  <strong className="text-stone-900">Do NOT append &quot;:3000&quot; to the public Render URL</strong>
                  <p className="text-stone-600 mt-0.5">
                    Render provides a public HTTPS address. Adding <code className="bg-stone-100 px-1 py-0.5 rounded text-rose-700 font-mono">:3000</code> to the URL will cause a connection timeout.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-rose-100">
                <span className="font-bold text-rose-600 text-sm leading-none shrink-0 mt-0.5">3.</span>
                <div>
                  <strong className="text-stone-900">Check the &quot;https://&quot; prefix</strong>
                  <p className="text-stone-600 mt-0.5">
                    Always include <code className="bg-stone-100 px-1 py-0.5 rounded text-emerald-800 font-mono">https://</code> in your browser address bar on the desktop monitor.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-rose-100">
                <span className="font-bold text-rose-600 text-sm leading-none shrink-0 mt-0.5">4.</span>
                <div>
                  <strong className="text-stone-900">Ethernet Cable & Network Firewall</strong>
                  <p className="text-stone-600 mt-0.5">
                    Verify that your desktop PC can open standard websites (e.g. google.com). If you are on an enterprise/office ethernet, verify outbound access to <code className="bg-stone-100 px-1 py-0.5 rounded font-mono">*.run.app</code> is allowed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 text-stone-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secure Cloud Synchronization</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
