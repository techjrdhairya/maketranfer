import { apiUrl } from '../../lib/apiBase';
import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { Download, FileText, Loader2, AlertCircle } from 'lucide-react';

interface DocxViewerProps {
  slug: string;
  filename: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const DocxViewer: React.FC<DocxViewerProps> = ({ slug, filename, accessToken, itemPath }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set('token', accessToken);
  if (itemPath) queryParams.set('path', itemPath);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const rawUrl = apiUrl(`/api/files/${slug}/raw${queryStr}`);
  const downloadUrl = apiUrl(`/api/files/${slug}/download${queryStr}`);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(rawUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.arrayBuffer();
      })
      .then(async (arrayBuffer) => {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (isMounted) {
          setHtmlContent(result.value || '<p className="text-stone-400 italic">This document appears to be empty.</p>');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Mammoth docx parse error:', err);
          setError('Could not parse Word document for direct preview. You can still download the original DOCX file below.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rawUrl]);

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden flex flex-col w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase tracking-wider">
            DOCX
          </span>
          <span className="text-xs font-medium text-stone-700 truncate max-w-xs md:max-w-md font-mono">{filename}</span>
        </div>

        <a
          href={downloadUrl}
          className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Word Document</span>
        </a>
      </div>

      {/* Body */}
      <div className="p-8 md:p-12 min-h-[450px] max-h-[750px] overflow-y-auto bg-stone-50/40 flex justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <p className="text-sm">Converting Word document for preview...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center max-w-md text-center py-12 space-y-4">
            <div className="p-3 bg-amber-50 rounded-full text-amber-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-stone-800">Preview Unavailable</p>
              <p className="text-xs text-stone-500 mt-1">{error}</p>
            </div>
            <a
              href={downloadUrl}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Download File ({filename})</span>
            </a>
          </div>
        ) : (
          <div className="bg-white shadow-sm border border-stone-200/80 rounded-lg p-8 md:p-12 max-w-3xl w-full">
            <div
              className="prose prose-stone max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-table:border prose-table:border-stone-200"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
