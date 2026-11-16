import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileUp,
  AlertCircle,
  FileText,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Image,
  FileArchive,
  Sparkles,
  FolderUp,
  Files,
  X,
  Layers,
  Check,
  Folder,
  Trash2,
  Link as LinkIcon,
  FolderTree,
  FileStack,
} from 'lucide-react';
import { uploadFile, uploadBundle, uploadMultipleSeparate } from '../lib/api';
import { formatBytes, getFileCategoryColor } from '../lib/format';
import { UploadResponse } from '../types';

interface UploadDropzoneProps {
  onUploadSuccess: (res: UploadResponse, uploadedFile: File | null) => void;
  onMultiUploadSuccess?: (res: UploadResponse[]) => void;
}

interface StagedFile {
  file: File;
  path: string;
}

async function scanFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<StagedFile[]> {
  const items = dataTransfer.items;
  const results: StagedFile[] = [];

  async function traverseEntry(entry: any, currentPath = ''): Promise<void> {
    if (entry.isFile) {
      return new Promise<void>((resolve) => {
        entry.file((file: File) => {
          results.push({
            file,
            path: currentPath ? `${currentPath}/${file.name}` : file.name,
          });
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readEntries = (): Promise<any[]> =>
        new Promise((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });

      let entries: any[] = [];
      let readBatch = await readEntries();
      while (readBatch.length > 0) {
        entries = entries.concat(readBatch);
        readBatch = await readEntries();
      }

      for (const child of entries) {
        await traverseEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
      }
    }
  }

  const entriesToTraverse: any[] = [];
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) entriesToTraverse.push(entry);
      }
    }
  }

  if (entriesToTraverse.length > 0) {
    for (const entry of entriesToTraverse) {
      await traverseEntry(entry);
    }
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const f = dataTransfer.files[i];
      results.push({ file: f, path: f.webkitRelativePath || f.name });
    }
  }

  return results;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onUploadSuccess,
  onMultiUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Staged multi-file / folder state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [bundleFolderName, setBundleFolderName] = useState<string>('');
  const [isFolderMode, setIsFolderMode] = useState(false);
  const [multiLinkMode, setMultiLinkMode] = useState<'individual' | 'bundle'>('individual');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Handle single file immediate upload
  const uploadSingleFile = async (file: File) => {
    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatusText(`Uploading ${file.name}...`);

    try {
      const res = await uploadFile(file, undefined, (progress) => {
        setUploadProgress(progress);
      });

      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        onUploadSuccess(res, file);
      }, 400);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage(err.message || 'File upload failed. Please try again.');
    }
  };

  // Upload staged files based on chosen mode
  const handleProceedStagedUpload = async () => {
    if (stagedFiles.length === 0) return;
    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(0);

    if (multiLinkMode === 'individual') {
      // Option B: Create different links for each file
      try {
        setUploadStatusText(`Creating individual links for ${stagedFiles.length} files...`);
        const files = stagedFiles.map((s) => s.file);
        const results = await uploadMultipleSeparate(files, (progress, currentText) => {
          setUploadProgress(progress);
          if (currentText) setUploadStatusText(currentText);
        });

        setUploadProgress(100);
        setTimeout(() => {
          setIsUploading(false);
          if (onMultiUploadSuccess) {
            onMultiUploadSuccess(results);
          } else if (results.length > 0) {
            onUploadSuccess(results[0], null);
          }
        }, 400);
      } catch (err: any) {
        setIsUploading(false);
        setErrorMessage(err.message || 'Multi-file upload failed. Please try again.');
      }
    } else {
      // Option A: Bundle all into a single link
      try {
        const files = stagedFiles.map((s) => s.file);
        const paths = stagedFiles.map((s) => s.path);
        const folderName = bundleFolderName.trim() || 'Folder-Collection';
        setUploadStatusText(`Packaging folder bundle "${folderName}"...`);

        const res = await uploadBundle(files, paths, folderName, undefined, (progress) => {
          setUploadProgress(progress);
        });

        setUploadProgress(100);
        setTimeout(() => {
          setIsUploading(false);
          onUploadSuccess(res, null);
        }, 400);
      } catch (err: any) {
        setIsUploading(false);
        setErrorMessage(err.message || 'Bundle upload failed. Please try again.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setErrorMessage(null);

    const scanned = await scanFilesFromDataTransfer(e.dataTransfer);
    if (scanned.length === 0) return;

    if (scanned.length === 1 && !scanned[0].path.includes('/')) {
      // Single regular file dropped
      uploadSingleFile(scanned[0].file);
    } else {
      // Multiple files or a folder dropped -> stage for review
      let folderTitle = 'Collection';
      const firstWithPath = scanned.find((s) => s.path.includes('/'));
      if (firstWithPath) {
        folderTitle = firstWithPath.path.split('/')[0];
      }
      setBundleFolderName(folderTitle);
      setStagedFiles(scanned);
      setIsFolderMode(Boolean(firstWithPath));
      // Default to individual if user dropped loose multiple files, or bundle if dropped an explicit folder tree
      setMultiLinkMode(firstWithPath ? 'bundle' : 'individual');
    }
  };

  const handleSingleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadSingleFile(e.target.files[0]);
    }
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      const staged: StagedFile[] = fileList.map((f) => ({
        file: f,
        path: f.webkitRelativePath || f.name,
      }));

      let folderTitle = 'Folder';
      if (fileList[0].webkitRelativePath) {
        folderTitle = fileList[0].webkitRelativePath.split('/')[0];
      }
      setBundleFolderName(folderTitle);
      setStagedFiles(staged);
      setIsFolderMode(true);
      setMultiLinkMode('bundle');
    }
  };

  const handleMultiFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      if (fileList.length === 1) {
        uploadSingleFile(fileList[0]);
      } else {
        const staged: StagedFile[] = fileList.map((f) => ({
          file: f,
          path: f.name,
        }));
        setBundleFolderName('Multi-File Package');
        setStagedFiles(staged);
        setIsFolderMode(false);
        setMultiLinkMode('individual');
      }
    }
  };

  const removeStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalStagedSize = stagedFiles.reduce((acc, curr) => acc + curr.file.size, 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Hidden file pickers */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleSingleFileInput}
        disabled={isUploading}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderInput}
        disabled={isUploading}
      />
      <input
        ref={multiFileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleMultiFileInput}
        disabled={isUploading}
      />

      {/* Main Upload Dropzone or Staging Review */}
      {stagedFiles.length > 0 ? (
        /* Staged Multi-File / Folder Review Card with Link Mode Choice */
        <div className="bg-white rounded-3xl border border-stone-200 shadow-md p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  multiLinkMode === 'individual'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {multiLinkMode === 'individual' ? (
                  <FileStack className="w-5 h-5" />
                ) : (
                  <Folder className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  {stagedFiles.length} Files Selected
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {formatBytes(totalStagedSize)} total
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setStagedFiles([]);
                setErrorMessage(null);
              }}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Link Generation Option Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-600">
              How would you like to share these files?
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Mode 1: Individual Links */}
              <button
                type="button"
                onClick={() => setMultiLinkMode('individual')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  multiLinkMode === 'individual'
                    ? 'border-emerald-600 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-600/20'
                    : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <LinkIcon
                      className={`w-4 h-4 ${
                        multiLinkMode === 'individual' ? 'text-emerald-700' : 'text-stone-500'
                      }`}
                    />
                    <span
                      className={`text-xs font-bold ${
                        multiLinkMode === 'individual' ? 'text-emerald-950' : 'text-stone-800'
                      }`}
                    >
                      Different Links for Each File
                    </span>
                  </div>
                  {multiLinkMode === 'individual' && (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  Generates {stagedFiles.length} separate links. Each file can be shared, viewed, or protected independently.
                </p>
              </button>

              {/* Mode 2: Bundle as 1 Link */}
              <button
                type="button"
                onClick={() => setMultiLinkMode('bundle')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  multiLinkMode === 'bundle'
                    ? 'border-amber-600 bg-amber-50/70 shadow-xs ring-2 ring-amber-600/20'
                    : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <FolderTree
                      className={`w-4 h-4 ${
                        multiLinkMode === 'bundle' ? 'text-amber-700' : 'text-stone-500'
                      }`}
                    />
                    <span
                      className={`text-xs font-bold ${
                        multiLinkMode === 'bundle' ? 'text-amber-950' : 'text-stone-800'
                      }`}
                    >
                      Single Folder Bundle
                    </span>
                  </div>
                  {multiLinkMode === 'bundle' && (
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 leading-normal">
                  Packages all files into one link with a folder explorer and bulk zip download.
                </p>
              </button>
            </div>
          </div>

          {/* Folder Name Input (only if bundle mode is active) */}
          {multiLinkMode === 'bundle' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-700">
                Bundle / Folder Title
              </label>
              <input
                type="text"
                value={bundleFolderName}
                onChange={(e) => setBundleFolderName(e.target.value)}
                placeholder="e.g. project-assets-2026"
                className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-stone-400 focus:bg-white transition-all font-mono"
              />
            </div>
          )}

          {/* Files List Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
              <span>Files to include ({stagedFiles.length})</span>
              <span>Size</span>
            </div>

            <div className="max-h-52 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 bg-stone-50/50">
              {stagedFiles.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-stone-100/80 group transition-colors"
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="font-mono text-stone-700 truncate">{item.path}</span>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <span className="font-mono text-[11px] text-stone-400">
                      {formatBytes(item.file.size)}
                    </span>
                    <button
                      onClick={() => removeStagedFile(idx)}
                      disabled={isUploading}
                      className="text-stone-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upload Progress for Bundle / Multi-upload */}
          {isUploading && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs text-stone-600 font-mono">
                <span className="truncate pr-2">{uploadStatusText || `Uploading ${stagedFiles.length} files...`}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden border border-stone-200">
                <div
                  className="bg-indigo-600 h-full transition-all duration-150 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              onClick={() => setStagedFiles([])}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleProceedStagedUpload}
              disabled={isUploading || stagedFiles.length === 0}
              className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-400 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              {multiLinkMode === 'individual' ? (
                <>
                  <LinkIcon className="w-4 h-4 text-emerald-300" />
                  <span>Create {stagedFiles.length} Different Links ({formatBytes(totalStagedSize)})</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-amber-300" />
                  <span>Upload Single Bundle ({formatBytes(totalStagedSize)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Primary Dropzone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`relative group rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden p-8 sm:p-12 text-center bg-white ${
            isDragging
              ? 'border-stone-900 bg-stone-100/80 scale-[1.01]'
              : 'border-stone-300/90 hover:border-stone-400 hover:bg-stone-50/50 shadow-sm'
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-900 border border-stone-200 animate-bounce">
                <UploadCloud className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <p className="font-bold text-stone-900 text-base">{uploadStatusText || 'Uploading documents...'}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-md bg-stone-100 rounded-full h-2.5 overflow-hidden border border-stone-200">
                <div
                  className="bg-indigo-600 h-full transition-all duration-150 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>

              <div className="flex items-center justify-between w-full max-w-md text-xs text-stone-500 font-mono">
                <span>{uploadProgress}%</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-stone-100 group-hover:bg-stone-200/80 group-hover:scale-105 transition-all flex items-center justify-center text-stone-800 border border-stone-200/80 shadow-2xs">
                <FileUp className="w-8 h-8" />
              </div>

              <div className="space-y-1.5">
                <p className="text-base sm:text-lg font-bold text-stone-900">
                  Choose documents or drag & drop files / folders
                </p>
                <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto">
                  Upload single documents, folders, or create different links for multiple files
                </p>
              </div>

              {/* Quick Pickers Bar */}
              <div
                className="flex flex-wrap items-center justify-center gap-2 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                </button>

                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                >
                  <FolderUp className="w-3.5 h-3.5 text-amber-700" />
                  <span>Upload Entire Folder</span>
                </button>

                <button
                  onClick={() => multiFileInputRef.current?.click()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Files className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Multiple Files (Individual Links)</span>
                </button>
              </div>

              <p className="text-[11px] text-stone-400 font-medium">
                Unlimited file & folder size • Choice of single bundle or separate links
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="flex items-start space-x-2.5 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Upload Notice</p>
            <p className="text-red-700 mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

