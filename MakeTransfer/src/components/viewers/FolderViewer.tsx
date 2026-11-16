import { apiUrl } from '../../lib/apiBase';
import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Film,
  Music,
  Download,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Archive,
  Menu,
  X,
  Sparkles,
  Layers,
  FileCheck,
} from 'lucide-react';
import { DocumentMetadata, FolderItemMetadata } from '../../types';
import { formatBytes, getFileCategoryColor } from '../../lib/format';
import { PdfViewer } from './PdfViewer';
import { ImageViewer } from './ImageViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { CodeTextViewer } from './CodeTextViewer';
import { DocxViewer } from './DocxViewer';
import { SpreadsheetViewer } from './SpreadsheetViewer';
import { MediaViewer } from './MediaViewer';
import { BinaryDownloadCard } from './BinaryDownloadCard';

interface FolderViewerProps {
  document: DocumentMetadata;
  accessToken?: string | null;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  item?: FolderItemMetadata;
  children: Map<string, TreeNode>;
}

function buildTree(items: FolderItemMetadata[]): TreeNode {
  const root: TreeNode = {
    name: 'root',
    fullPath: '',
    isFolder: true,
    children: new Map(),
  };

  for (const item of items) {
    const parts = item.path.replace(/^\/+/, '').split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath: parts.slice(0, i + 1).join('/'),
          isFolder: !isLast,
          item: isLast ? item : undefined,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

export const FolderViewer: React.FC<FolderViewerProps> = ({ document, accessToken }) => {
  const items = document.items || [];

  // Default selection: Prefer README.md or index.* or first file
  const defaultItem = useMemo(() => {
    if (items.length === 0) return null;
    const readme = items.find((it) => it.name.toLowerCase().startsWith('readme'));
    if (readme) return readme;
    const indexFile = items.find((it) => it.name.toLowerCase().startsWith('index'));
    if (indexFile) return indexFile;
    return items[0];
  }, [items]);

  const [selectedItem, setSelectedItem] = useState<FolderItemMetadata | null>(defaultItem);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Expand root & first-level folders by default
    const set = new Set<string>();
    items.forEach((it) => {
      const parts = it.path.split('/');
      if (parts.length > 1) {
        set.add(parts[0]);
      }
    });
    return set;
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const tree = useMemo(() => buildTree(items), [items]);

  const toggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (it) => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const renderFileIcon = (item: FolderItemMetadata) => {
    const ext = item.extension.toLowerCase();
    if (item.previewType === 'pdf') return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    if (item.previewType === 'image') return <ImageIcon className="w-4 h-4 text-purple-500 shrink-0" />;
    if (item.previewType === 'markdown') return <FileText className="w-4 h-4 text-sky-500 shrink-0" />;
    if (item.previewType === 'text') return <FileCode className="w-4 h-4 text-amber-500 shrink-0" />;
    if (item.previewType === 'docx') return <FileText className="w-4 h-4 text-blue-500 shrink-0" />;
    if (item.previewType === 'spreadsheet') return <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (item.previewType === 'video') return <Film className="w-4 h-4 text-rose-500 shrink-0" />;
    if (item.previewType === 'audio') return <Music className="w-4 h-4 text-indigo-500 shrink-0" />;
    return <File className="w-4 h-4 text-stone-400 shrink-0" />;
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    if (node.name === 'root') {
      return Array.from(node.children.values()).map((child) => renderTreeNode(child, 0));
    }

    const isExpanded = expandedPaths.has(node.fullPath);
    const isSelected = selectedItem && node.item && selectedItem.id === node.item.id;

    if (node.isFolder) {
      return (
        <div key={node.fullPath} className="select-none">
          <button
            onClick={() => toggleFolder(node.fullPath)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="w-full flex items-center justify-between py-1.5 pr-2 text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-100/80 rounded-lg transition-colors group cursor-pointer"
          >
            <div className="flex items-center space-x-1.5 truncate">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
            <span className="text-[10px] text-stone-400 font-mono">
              {node.children.size}
            </span>
          </button>

          {isExpanded && (
            <div className="space-y-0.5">
              {Array.from(node.children.values()).map((child) =>
                renderTreeNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    // Leaf file node
    return (
      <button
        key={node.fullPath}
        onClick={() => {
          if (node.item) {
            setSelectedItem(node.item);
            setIsMobileDrawerOpen(false);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 24}px` }}
        className={`w-full flex items-center justify-between py-1.5 pr-2 text-xs rounded-lg transition-all cursor-pointer ${
          isSelected
            ? 'bg-indigo-600 text-white font-medium shadow-2xs'
            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          {node.item && renderFileIcon(node.item)}
          <span className="truncate">{node.name}</span>
        </div>
        {node.item && (
          <span
            className={`text-[10px] font-mono shrink-0 ml-1.5 ${
              isSelected ? 'text-stone-300' : 'text-stone-400'
            }`}
          >
            {formatBytes(node.item.size)}
          </span>
        )}
      </button>
    );
  };

  const selectedCategory = selectedItem ? getFileCategoryColor(selectedItem.extension) : null;
  const singleFileDownloadUrl = selectedItem
    ? apiUrl(`/api/files/${document.slug}/download?path=${encodeURIComponent(selectedItem.path)}${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ''}`)
    : '#';
  const singleFileRawUrl = selectedItem
    ? apiUrl(`/api/files/${document.slug}/raw?path=${encodeURIComponent(selectedItem.path)}${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ''}`)
    : '#';
  const zipDownloadUrl = apiUrl(`/api/files/${document.slug}/download${accessToken ? `?token=${encodeURIComponent(accessToken)}` : ''}`);

  return (
    <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden flex flex-col">
      {/* Top Folder Header Bar */}
      <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            onClick={() => setIsMobileDrawerOpen(true)}
            className="md:hidden p-1.5 text-stone-600 hover:text-stone-950 bg-stone-200/70 rounded-lg"
            title="Open file explorer"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Archive className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-stone-900 truncate">
              {document.folderName || document.originalFilename}
            </h2>
            <div className="flex items-center space-x-2 text-[11px] text-stone-500 font-mono">
              <span>{items.length} {items.length === 1 ? 'file' : 'files'}</span>
              <span>•</span>
              <span>Total {formatBytes(document.size)}</span>
            </div>
          </div>
        </div>

        {/* Global Action: Download Entire Folder ZIP */}
        <div className="flex items-center space-x-2">
          <a
            href={zipDownloadUrl}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All (.zip)</span>
          </a>
        </div>
      </div>

      {/* Main Split Body: Sidebar Explorer + Active Preview */}
      <div className="flex flex-col md:flex-row min-h-[620px]">
        {/* Left Sidebar (Desktop) */}
        <aside className="hidden md:flex flex-col w-72 lg:w-80 border-r border-stone-200 bg-stone-50/50 p-3 shrink-0">
          {/* Search Box */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in folder..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tree or Search Results */}
          <div className="flex-1 overflow-y-auto max-h-[560px] space-y-0.5 pr-1">
            {filteredItems ? (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">
                  Matching Files ({filteredItems.length})
                </p>
                {filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white font-medium'
                          : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {renderFileIcon(item)}
                        <div className="truncate text-left">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className={`text-[10px] font-mono truncate ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                            {item.path}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono ml-2 ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                        {formatBytes(item.size)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              renderTreeNode(tree)
            )}
          </div>
        </aside>

        {/* Mobile Drawer */}
        {isMobileDrawerOpen && (
          <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex md:hidden">
            <div className="w-4/5 max-w-xs bg-white h-full p-4 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
                <div className="flex items-center space-x-2">
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-xs text-stone-900">Files Explorer</span>
                </div>
                <button
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1 text-stone-500 hover:text-stone-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in folder..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg text-stone-800"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-0.5">
                {filteredItems ? (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedItem(item);
                        setIsMobileDrawerOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-lg text-xs text-stone-700 hover:bg-stone-100"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {renderFileIcon(item)}
                        <span className="truncate">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-stone-400">{formatBytes(item.size)}</span>
                    </button>
                  ))
                ) : (
                  renderTreeNode(tree)
                )}
              </div>
            </div>
            <div className="flex-1" onClick={() => setIsMobileDrawerOpen(false)} />
          </div>
        )}

        {/* Right Active Preview Pane */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {selectedItem ? (
            <div className="flex flex-col h-full">
              {/* Selected File Breadcrumb & Action Bar */}
              <div className="px-4 py-2.5 bg-stone-100/70 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 truncate">
                  <span
                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                      selectedCategory?.bg || 'bg-stone-200'
                    } ${selectedCategory?.text || 'text-stone-800'} border ${
                      selectedCategory?.border || 'border-stone-300'
                    } uppercase`}
                  >
                    .{selectedItem.extension}
                  </span>
                  <span className="font-mono text-stone-500 font-medium truncate">
                    {selectedItem.path}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <a
                    href={singleFileRawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-stone-500 hover:text-stone-900 bg-white hover:bg-stone-200 border border-stone-300/80 rounded-lg transition-colors shadow-2xs"
                    title="Open raw file in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <a
                    href={singleFileDownloadUrl}
                    className="flex items-center space-x-1.5 px-3 py-1 bg-white hover:bg-stone-50 text-stone-800 border border-stone-300/80 rounded-lg font-medium shadow-2xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File ({formatBytes(selectedItem.size)})</span>
                  </a>
                </div>
              </div>

              {/* Sub-Viewer */}
              <div className="p-4 flex-1 overflow-auto bg-stone-50/30">
                {selectedItem.previewType === 'pdf' && (
                  <PdfViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'image' && (
                  <ImageViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'markdown' && (
                  <MarkdownViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'text' && (
                  <CodeTextViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    extension={selectedItem.extension}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'docx' && (
                  <DocxViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'spreadsheet' && (
                  <SpreadsheetViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {(selectedItem.previewType === 'audio' || selectedItem.previewType === 'video') && (
                  <MediaViewer
                    slug={document.slug}
                    filename={selectedItem.name}
                    type={selectedItem.previewType}
                    itemPath={selectedItem.path}
                    accessToken={accessToken}
                  />
                )}
                {selectedItem.previewType === 'binary' && (
                  <div className="max-w-md mx-auto py-12 text-center space-y-4">
                    <div className="w-14 h-14 bg-stone-100 rounded-2xl mx-auto flex items-center justify-center text-stone-600 border border-stone-200">
                      <File className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-stone-900">{selectedItem.name}</h3>
                      <p className="text-xs text-stone-500 font-mono">{formatBytes(selectedItem.size)} • .{selectedItem.extension}</p>
                    </div>
                    <a
                      href={singleFileDownloadUrl}
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-stone-400 space-y-2">
              <Folder className="w-8 h-8" />
              <p className="text-sm font-medium">Select a file from the explorer to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
