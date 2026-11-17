import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/apiBase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Download, FileText, Loader2 } from 'lucide-react';

interface MarkdownViewerProps {
  slug: string;
  filename: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ slug, filename, accessToken, itemPath }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set('token', accessToken);
  if (itemPath) queryParams.set('path', itemPath);
  const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const rawUrl = `${API_BASE}/api/files/${slug}/raw${queryStr}`;
  const downloadUrl = `${API_BASE}/api/files/${slug}/download${queryStr}`;

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch(rawUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load markdown: ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (isMounted) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [rawUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col w-full">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-200 text-stone-800 uppercase tracking-wider">
            MARKDOWN
          </span>
          <span className="text-xs font-medium text-stone-700 truncate max-w-xs md:max-w-md font-mono">{filename}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex bg-stone-200/70 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('rendered')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'rendered' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'raw' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Source
            </button>
          </div>

          <button
            onClick={handleCopy}
            disabled={loading || !content}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <a
            href={downloadUrl}
            className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 md:p-8 min-h-[400px] max-h-[750px] overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            <p className="text-sm">Rendering Markdown...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-600 space-y-2">
            <p className="font-semibold">Unable to load document</p>
            <p className="text-xs text-stone-500">{error}</p>
          </div>
        ) : viewMode === 'rendered' ? (
          <article className="prose prose-stone max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600 prose-pre:bg-stone-900 prose-pre:text-stone-100 prose-code:text-stone-900 prose-code:bg-stone-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        ) : (
          <pre className="font-mono text-xs leading-relaxed text-stone-800 bg-stone-50 p-4 rounded-lg border border-stone-200 overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
};
