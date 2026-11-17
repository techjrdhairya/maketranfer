import React from 'react';
import { API_BASE } from '../../lib/apiBase';
import { Download, Music, Video as VideoIcon } from 'lucide-react';

interface MediaViewerProps {
  slug: string;
  filename: string;
  type: 'audio' | 'video';
  accessToken?: string | null;
  itemPath?: string;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({ slug, filename, type, accessToken, itemPath }) => {
  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set('token', accessToken);
  if (itemPath) queryParams.set('path', itemPath);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const rawUrl = `${API_BASE}/api/files/${slug}/raw${queryStr}`;
  const downloadUrl = `${API_BASE}/api/files/${slug}/download${queryStr}`;

  return (
    <div className="bg-stone-900 rounded-xl border border-stone-800 shadow-sm overflow-hidden flex flex-col w-full text-stone-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-950 border-b border-stone-800">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50 uppercase tracking-wider flex items-center gap-1">
            {type === 'audio' ? <Music className="w-3 h-3" /> : <VideoIcon className="w-3 h-3" />}
            {type.toUpperCase()}
          </span>
          <span className="text-xs text-stone-300 font-mono truncate max-w-xs md:max-w-md">{filename}</span>
        </div>

        <a
          href={downloadUrl}
          className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Media</span>
        </a>
      </div>

      {/* Player Container */}
      <div className="p-8 flex flex-col items-center justify-center min-h-[300px] bg-stone-950/60">
        {type === 'video' ? (
          <video
            controls
            playsInline
            src={rawUrl}
            className="max-h-[550px] w-full max-w-4xl rounded-lg shadow-2xl bg-black border border-stone-800"
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="flex flex-col items-center space-y-6 max-w-lg w-full p-8 bg-stone-900 border border-stone-800 rounded-2xl">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 animate-pulse">
              <Music className="w-10 h-10" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-stone-100">{filename}</p>
              <p className="text-xs text-stone-400 mt-1">Audio playback ready</p>
            </div>
            <audio controls src={rawUrl} className="w-full">
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
};
