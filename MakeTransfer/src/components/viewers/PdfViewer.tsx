import { apiUrl } from '../../lib/apiBase';
import React, { useState } from 'react';
import { Download, ExternalLink, Maximize2, RefreshCw } from 'lucide-react';

interface PdfViewerProps {
  slug: string;
  filename: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ slug, filename, accessToken, itemPath }) => {
  const [loadError, setLoadError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set('token', accessToken);
  if (itemPath) queryParams.set('path', itemPath);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const rawUrl = apiUrl(`/api/files/${slug}/raw${queryStr}`);
  const downloadUrl = apiUrl(`/api/files/${slug}/download${queryStr}`);

  return (
    <div className={`relative bg-stone-900 rounded-xl border border-stone-700 shadow-sm overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-4 z-50 rounded-2xl shadow-2xl' : 'h-[700px] w-full'}`}>
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-800 border-b border-stone-700 text-stone-200">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/50 uppercase tracking-wider">
            PDF
          </span>
          <span className="text-xs text-stone-300 truncate max-w-xs md:max-w-md font-mono">{filename}</span>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-stone-300 hover:text-white bg-stone-700/60 hover:bg-stone-700 rounded-lg transition-colors"
            title="Open raw PDF in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open New Tab</span>
          </a>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-stone-300 hover:text-white bg-stone-700/60 hover:bg-stone-700 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <a
            href={downloadUrl}
            className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* PDF View Container */}
      <div className="flex-1 w-full bg-stone-900 relative">
        {!loadError ? (
          <iframe
            src={`${rawUrl}#toolbar=1&navpanes=1`}
            title={filename}
            className="w-full h-full border-0"
            onError={() => setLoadError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-stone-300 space-y-4">
            <p className="text-sm">In-browser PDF preview could not be loaded directly.</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setLoadError(false)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-stone-800 hover:bg-stone-700 rounded-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <a
                href={downloadUrl}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
