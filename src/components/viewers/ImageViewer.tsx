import React, { useState } from 'react';
import { API_BASE } from '../../lib/apiBase';
import { ZoomIn, ZoomOut, RotateCw, Download, ExternalLink, Maximize2 } from 'lucide-react';

interface ImageViewerProps {
  slug: string;
  filename: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ slug, filename, accessToken, itemPath }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set('token', accessToken);
  if (itemPath) queryParams.set('path', itemPath);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const rawUrl = `${API_BASE}/api/files/${slug}/raw${queryStr}`;
  const downloadUrl = `${API_BASE}/api/files/${slug}/download${queryStr}`;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div
      className={`relative bg-stone-900/95 rounded-xl border border-stone-800 shadow-sm overflow-hidden flex flex-col ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-2xl shadow-2xl' : 'min-h-[500px] max-h-[700px] w-full'
      }`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-900 border-b border-stone-800 text-stone-200">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50 uppercase tracking-wider">
            IMAGE
          </span>
          <span className="text-xs text-stone-300 truncate max-w-xs md:max-w-md font-mono">{filename}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-stone-800/80 rounded-lg p-0.5 border border-stone-700/60">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-700/50 rounded-md transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1.5 text-stone-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-700/50 rounded-md transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleRotate}
            className="p-1.5 text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 border border-stone-700/60 rounded-lg transition-colors"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 border border-stone-700/60 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <a
            href={downloadUrl}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* Image Canvas with checkered background for alpha transparency */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:16px_16px] bg-stone-950">
        <div
          className="transition-transform duration-200 ease-out flex items-center justify-center cursor-pointer"
          onClick={handleReset}
          title="Click to reset zoom and rotation"
        >
          <img
            src={rawUrl}
            alt={filename}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            className="max-h-[600px] max-w-full object-contain rounded shadow-lg select-none"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </div>
  );
};
