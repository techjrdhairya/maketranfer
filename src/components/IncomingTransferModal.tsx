import React from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Wifi } from 'lucide-react';
import { useDevices } from '../context/DeviceContext';
import { formatBytes } from '../lib/format';
import { navigateToDevices } from '../lib/nav';

// Global overlays: "X wants to send you files" prompts + progress of direct transfers being received.
export const IncomingTransferModal: React.FC = () => {
  const { requests, receives, acceptRequest, declineRequest } = useDevices();
  const request = requests[0];

  return (
    <>
      {request && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white flex items-center justify-center shrink-0">
                <Wifi className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-stone-900">Incoming direct transfer</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  <strong className="text-stone-800">{request.fromName}</strong> <span className="font-mono">({request.fromId})</span> wants to send you{' '}
                  {request.files.length === 1 ? 'a file' : `${request.files.length} files`} ({formatBytes(request.totalSize)}).
                </p>
              </div>
            </div>

            <ul className="max-h-40 overflow-y-auto text-xs text-stone-700 bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-1.5">
              {request.files.slice(0, 30).map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="flex items-center space-x-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <span className="font-mono text-stone-400 shrink-0">{formatBytes(f.size)}</span>
                </li>
              ))}
              {request.files.length > 30 && <li className="text-stone-400">…and {request.files.length - 30} more</li>}
            </ul>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              The file goes straight from their device to yours. Only accept files from people you know.
            </p>

            <div className="flex items-center justify-end space-x-2">
              {requests.length > 1 && <span className="text-[11px] text-stone-400 mr-auto">{requests.length - 1} more waiting</span>}
              <button
                type="button"
                onClick={() => declineRequest(request.id)}
                className="px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => acceptRequest(request.id)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 cursor-pointer"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {receives.length > 0 && (
        <div className="fixed bottom-24 md:bottom-4 right-4 z-[65] w-[min(22rem,calc(100vw-2rem))] space-y-2">
          {receives.map((r) => (
            <div key={r.tid} className="bg-white border border-stone-200 rounded-2xl shadow-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center space-x-2 font-bold text-stone-800 min-w-0">
                  {r.status === 'receiving' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                  ) : r.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span className="truncate">
                    {r.status === 'receiving' ? `Receiving from ${r.fromName}` : r.status === 'done' ? 'Received' : 'Transfer failed'}
                  </span>
                </span>
                <span className="font-mono text-stone-500">{r.status === 'error' ? '' : `${r.percent}%`}</span>
              </div>
              {r.status === 'error' ? (
                <p className="text-[11px] text-red-600">{r.error}</p>
              ) : (
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 transition-all" style={{ width: `${r.percent}%` }} />
                </div>
              )}
              {r.status === 'done' && (
                <button type="button" onClick={navigateToDevices} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                  Open Devices to save the file
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
