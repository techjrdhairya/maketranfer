import { apiUrl } from '../../lib/apiBase';
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Table, Search, Loader2, AlertCircle } from 'lucide-react';

interface SpreadsheetViewerProps {
  slug: string;
  filename: string;
  accessToken?: string | null;
  itemPath?: string;
}

export const SpreadsheetViewer: React.FC<SpreadsheetViewerProps> = ({ slug, filename, accessToken, itemPath }) => {
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [data, setData] = useState<any[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);

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
      .then((buffer) => {
        if (!isMounted) return;
        const wb = XLSX.read(buffer, { type: 'array' });
        setWorkbookRef(wb);
        setSheetNames(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          const firstSheet = wb.SheetNames[0];
          setActiveSheet(firstSheet);
          const ws = wb.Sheets[firstSheet];
          const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          setData(jsonData);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Spreadsheet parse error:', err);
          setError('Could not parse spreadsheet for preview.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rawUrl]);

  const handleSheetChange = (name: string) => {
    setActiveSheet(name);
    if (workbookRef) {
      const ws = workbookRef.Sheets[name];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      setData(jsonData);
    }
  };

  const filteredData = searchFilter.trim()
    ? data.filter((row) =>
        row.some((cell) => String(cell).toLowerCase().includes(searchFilter.toLowerCase()))
      )
    : data;

  const headerRow = data.length > 0 ? data[0] : [];
  const bodyRows = filteredData.length > 0 ? (searchFilter.trim() ? filteredData : filteredData.slice(1)) : [];

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden flex flex-col w-full">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-stone-50 border-b border-stone-200">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
            SPREADSHEET
          </span>
          <span className="text-xs font-medium text-stone-700 truncate max-w-xs md:max-w-md font-mono">{filename}</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search table rows..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-white border border-stone-300 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:border-emerald-500 w-36 lg:w-48"
            />
          </div>

          <a
            href={downloadUrl}
            className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Excel</span>
          </a>
        </div>
      </div>

      {/* Sheet Tabs */}
      {sheetNames.length > 1 && (
        <div className="flex items-center space-x-1 px-4 py-1.5 bg-stone-100 border-b border-stone-200 overflow-x-auto text-xs">
          <span className="text-stone-500 font-medium mr-2 flex items-center">
            <Table className="w-3.5 h-3.5 mr-1" /> Sheets:
          </span>
          {sheetNames.map((sheet) => (
            <button
              key={sheet}
              onClick={() => handleSheetChange(sheet)}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeSheet === sheet
                  ? 'bg-white text-emerald-700 font-semibold shadow-2xs border border-stone-200/80'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              {sheet}
            </button>
          ))}
        </div>
      )}

      {/* Table view */}
      <div className="overflow-auto max-h-[600px] min-h-[350px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-sm">Reading spreadsheet cells...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-stone-600 space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
            <p>{error}</p>
            <a
              href={downloadUrl}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </a>
          </div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-stone-400">Sheet is empty.</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-stone-100 text-stone-700 sticky top-0 z-10 border-b border-stone-300">
              <tr>
                <th className="py-2 px-3 border-r border-stone-300 bg-stone-200 text-stone-500 w-10 text-center select-none font-sans">
                  #
                </th>
                {headerRow.map((col, idx) => (
                  <th key={idx} className="py-2 px-3 border-r border-stone-300 font-semibold truncate max-w-xs">
                    {String(col || `Col ${idx + 1}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800">
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-emerald-50/40 transition-colors odd:bg-white even:bg-stone-50/50">
                  <td className="py-1.5 px-3 border-r border-stone-200 text-stone-400 bg-stone-50 text-center select-none font-sans">
                    {searchFilter.trim() ? rIdx + 1 : rIdx + 2}
                  </td>
                  {headerRow.map((_, cIdx) => (
                    <td key={cIdx} className="py-1.5 px-3 border-r border-stone-200 truncate max-w-md">
                      {row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer stats */}
      {!loading && !error && (
        <div className="px-4 py-2 bg-stone-50 border-t border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
          <span>Total rows in sheet: {data.length.toLocaleString()}</span>
          {searchFilter && <span>Matching filter: {filteredData.length.toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
};
