import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/apiBase';
import { Copy, Check, Download, WrapText, Search, Loader2 } from 'lucide-react';

interface CodeTextViewerProps {
  slug: string;
  filename: string;
  extension: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const CodeTextViewer: React.FC<CodeTextViewerProps> = ({ slug, filename, extension, accessToken, itemPath }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);
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

  const lines = content.split('\n');
  const lineCount = lines.length;

  return (
    <div className="bg-stone-900 rounded-xl border border-stone-800 shadow-sm overflow-hidden flex flex-col w-full text-stone-100">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-stone-950 border-b border-stone-800">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 uppercase font-mono">
            {extension.toUpperCase() || 'TXT'}
          </span>
          <span className="text-xs text-stone-300 font-mono truncate max-w-xs">{filename}</span>
          <span className="text-xs text-stone-500 font-mono">({lineCount.toLocaleString()} lines)</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative hidden sm:block">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Find in file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-stone-900 border border-stone-700/80 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-stone-500 w-36 lg:w-48"
            />
          </div>

          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={`p-1.5 rounded-lg border text-xs transition-colors ${
              wrapLines
                ? 'bg-stone-800 border-stone-600 text-stone-200'
                : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
            }`}
            title={wrapLines ? 'Word wrap enabled' : 'Word wrap disabled'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            disabled={loading || !content}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700/60 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
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

      {/* Editor/Code Viewer */}
      <div className="overflow-x-auto overflow-y-auto max-h-[650px] min-h-[350px] p-0 font-mono text-xs leading-6 bg-stone-950/70">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
            <p>Loading text content...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : (
          <div className="divide-y divide-stone-900/40">
            {lines.map((line, idx) => {
              const lineNumber = idx + 1;
              const matchesSearch = searchQuery && line.toLowerCase().includes(searchQuery.toLowerCase());

              return (
                <div
                  key={idx}
                  className={`flex items-start hover:bg-stone-800/40 transition-colors ${
                    matchesSearch ? 'bg-amber-500/15' : ''
                  }`}
                >
                  <span className="w-12 py-0.5 pr-4 select-none text-right text-stone-600 bg-stone-950/90 font-mono text-[11px] shrink-0 sticky left-0">
                    {lineNumber}
                  </span>
                  <div
                    className={`py-0.5 px-3 flex-1 text-stone-200 ${
                      wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                    }`}
                  >
                    {searchQuery && matchesSearch ? (
                      highlightMatch(line, searchQuery)
                    ) : (
                      line || '\u00A0'
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-400 text-stone-950 rounded-xs px-0.5 font-bold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
