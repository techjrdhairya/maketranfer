import React from 'react';
import { API_BASE } from '../../lib/apiBase';
import { Download, FileArchive, ShieldCheck, HardDrive, Calendar, Eye } from 'lucide-react';
import { DocumentMetadata } from '../../types';
import { formatBytes, formatDate, getFileCategoryColor } from '../../lib/format';

interface BinaryDownloadCardProps {
  document: DocumentMetadata;
  accessToken?: string | null;
}

export const BinaryDownloadCard: React.FC<BinaryDownloadCardProps> = ({ document, accessToken }) => {
  const downloadUrl = `${API_BASE}/api/files/${document.slug}/download${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`;
  const colors = getFileCategoryColor(document.extension);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 md:p-12 flex flex-col items-center text-center max-w-xl mx-auto">
      {/* Extension Badge Icon */}
      <div className={`w-24 h-24 rounded-2xl ${colors.bg} ${colors.text} border ${colors.border} flex flex-col items-center justify-center shadow-xs mb-6`}>
        <FileArchive className="w-10 h-10 mb-1" />
        <span className="text-xs font-bold uppercase font-mono tracking-wider">
          .{document.extension}
        </span>
      </div>

      <h2 className="text-xl font-bold text-stone-900 break-all mb-2">
        {document.originalFilename}
      </h2>

      {document.description && (
        <p className="text-sm text-stone-600 mb-6 max-w-md italic">
          "{document.description}"
        </p>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full bg-stone-50 rounded-xl p-4 border border-stone-200/70 mb-8 text-left text-xs">
        <div>
          <span className="text-stone-400 block mb-0.5">File Size</span>
          <span className="font-semibold text-stone-800 flex items-center">
            <HardDrive className="w-3.5 h-3.5 mr-1 text-stone-500" />
            {formatBytes(document.size)}
          </span>
        </div>
        <div>
          <span className="text-stone-400 block mb-0.5">Uploaded</span>
          <span className="font-semibold text-stone-800 flex items-center">
            <Calendar className="w-3.5 h-3.5 mr-1 text-stone-500" />
            {formatDate(document.uploadedAt)}
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-stone-400 block mb-0.5">Downloads</span>
          <span className="font-semibold text-stone-800 flex items-center">
            <Eye className="w-3.5 h-3.5 mr-1 text-stone-500" />
            {document.downloadCount || 0} times
          </span>
        </div>
      </div>

      {/* Direct Download Button */}
      <a
        href={downloadUrl}
        className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all text-sm"
      >
        <Download className="w-4 h-4" />
        <span>Download File ({formatBytes(document.size)})</span>
      </a>

      {document.scanStatus === 'clean' && (
        <div className="flex items-center space-x-1.5 text-xs text-emerald-600 mt-5 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>Security check passed • Ready to download</span>
        </div>
      )}
    </div>
  );
};
