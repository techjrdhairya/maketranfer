import { apiUrl } from './apiBase';
import {
  DocumentMetadata,
  DocumentStatus,
  MyUploadItem,
  PublishRequest,
  UploadResponse,
  BatchPublishRequest,
  MultiUploadResult,
} from '../types';
import { auth, saveUserDocToCloud, deleteUserDocFromCloud, deleteAllUserDocsFromCloud, fetchPublicDocFromFirestore } from './firebase';

const MY_UPLOADS_STORAGE_KEY = 'maketransfer_my_uploads_v1';
const LEGACY_MY_UPLOADS_STORAGE_KEY = 'docshare_my_uploads_v1';

const ACCESS_TOKENS_KEY = 'maketransfer_access_tokens_v1';
const LEGACY_ACCESS_TOKENS_KEY = 'docshare_access_tokens_v1';

const CLIENT_ID_KEY = 'maketransfer_client_id_v1';
const LEGACY_CLIENT_ID_KEY = 'docshare_client_id_v1';

function emitUploadsUpdated(detail: any) {
  window.dispatchEvent(new CustomEvent('maketransfer:uploads_updated', { detail }));
  window.dispatchEvent(new CustomEvent('docshare:uploads_updated', { detail }));
  window.dispatchEvent(new Event('storage'));
}

export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY) || localStorage.getItem(LEGACY_CLIENT_ID_KEY);
    if (!id) {
      id = sessionStorage.getItem(CLIENT_ID_KEY) || sessionStorage.getItem(LEGACY_CLIENT_ID_KEY);
    }
    if (!id) {
      const match = document.cookie.match(/(?:maketransfer_client_id|docshare_client_id)=([^;]+)/);
      if (match) {
        id = match[1];
      }
    }
    if (!id) {
      id = 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
    }
    try {
      localStorage.setItem(CLIENT_ID_KEY, id);
      localStorage.setItem(LEGACY_CLIENT_ID_KEY, id);
      sessionStorage.setItem(CLIENT_ID_KEY, id);
      sessionStorage.setItem(LEGACY_CLIENT_ID_KEY, id);
      document.cookie = `maketransfer_client_id=${id}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `docshare_client_id=${id}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
    return id;
  } catch {
    return 'fallback_client_' + Date.now();
  }
}

// Save uploaded document to local storage, backups, and Firestore
export function saveMyUpload(item: MyUploadItem, opts?: { skipCloud?: boolean }) {
  try {
    const list = getMyUploads();
    const filtered = list.filter((x) => x.slug !== item.slug);
    filtered.unshift(item);
    const serialized = JSON.stringify(filtered.slice(0, 100));

    try {
      localStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
      localStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
    } catch {}
    try {
      sessionStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
      sessionStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
    } catch {}

    // Cookie backup for cross-iframe/reload resilience
    try {
      const mini = filtered.slice(0, 25).map((x) => `${x.slug}:${x.managementToken}`).join('|');
      document.cookie = `maketransfer_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `docshare_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    // Firestore Cloud Sync for Google authenticated user
    if (auth.currentUser && !opts?.skipCloud) {
      saveUserDocToCloud(auth.currentUser.uid, {
        id: item.slug,
        slug: item.slug,
        originalFilename: item.originalFilename,
        folderName: item.isFolder ? item.originalFilename : undefined,
        extension: item.originalFilename?.split('.').pop() || '',
        mimeType: item.isFolder ? 'application/zip' : 'application/octet-stream',
        size: item.size || 0,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        status: item.status || 'draft',
        viewCount: 0,
        downloadCount: 0,
        scanStatus: 'clean',
        previewType: item.isFolder ? 'folder' : 'text',
        isFolder: Boolean(item.isFolder),
        totalFiles: item.totalFiles,
        managementToken: item.managementToken,
      } as any).catch((e) => console.warn('Could not sync to cloud:', e));
    }

    // Notify listeners across app
    emitUploadsUpdated(filtered);
  } catch (e) {
    console.warn('Could not save to localStorage', e);
  }
}

export function getMyUploads(): MyUploadItem[] {
  try {
    let raw = localStorage.getItem(MY_UPLOADS_STORAGE_KEY) || localStorage.getItem(LEGACY_MY_UPLOADS_STORAGE_KEY);
    if (raw === '[]') return [];
    if (!raw) {
      raw = sessionStorage.getItem(MY_UPLOADS_STORAGE_KEY) || sessionStorage.getItem(LEGACY_MY_UPLOADS_STORAGE_KEY);
      if (raw === '[]') return [];
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    // Recover from cookie backup ONLY if storage was never set
    const cookieMatch = document.cookie.match(/(?:maketransfer_uploads_backup|docshare_uploads_backup)=([^;]+)/);
    if (cookieMatch) {
      const decoded = decodeURIComponent(cookieMatch[1]);
      const pairs = decoded.split('|').filter(Boolean);
      const recovered: MyUploadItem[] = pairs.map((p) => {
        const [slug, managementToken] = p.split(':');
        return {
          slug,
          managementToken: managementToken || '',
          originalFilename: slug,
          size: 0,
          uploadedAt: new Date().toISOString(),
        };
      });
      if (recovered.length > 0) {
        return recovered;
      }
    }

    return [];
  } catch {
    return [];
  }
}

// Write the local list without notifying listeners (used for background refreshes).
function persistMyUploadsQuiet(list: MyUploadItem[]) {
  const serialized = JSON.stringify(list.slice(0, 100));
  try {
    localStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
    localStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
  } catch {}
  try {
    sessionStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
    sessionStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
  } catch {}
  try {
    const mini = list.slice(0, 25).map((x) => `${x.slug}:${x.managementToken}`).join('|');
    document.cookie = `maketransfer_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `docshare_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

export function setMyUploadStatus(slug: string, status: DocumentStatus) {
  try {
    const list = getMyUploads().map((x) => (x.slug === slug ? { ...x, status } : x));
    persistMyUploadsQuiet(list);
  } catch {}
}

export function removeMyUpload(slug: string) {
  try {
    const list = getMyUploads().filter((x) => x.slug !== slug);
    const serialized = JSON.stringify(list);

    try {
      localStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
      localStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
    } catch {}
    try {
      sessionStorage.setItem(MY_UPLOADS_STORAGE_KEY, serialized);
      sessionStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, serialized);
    } catch {}

    try {
      const mini = list.slice(0, 25).map((x) => `${x.slug}:${x.managementToken}`).join('|');
      document.cookie = `maketransfer_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `docshare_uploads_backup=${encodeURIComponent(mini)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    emitUploadsUpdated(list);
  } catch (e) {
    console.warn('Could not update localStorage', e);
  }
}

export function clearAllMyUploads() {
  try {
    localStorage.setItem(MY_UPLOADS_STORAGE_KEY, '[]');
    localStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, '[]');
    sessionStorage.setItem(MY_UPLOADS_STORAGE_KEY, '[]');
    sessionStorage.setItem(LEGACY_MY_UPLOADS_STORAGE_KEY, '[]');
    document.cookie = 'maketransfer_uploads_backup=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'docshare_uploads_backup=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; max-age=0; SameSite=Lax';
    document.cookie = 'maketransfer_uploads_backup=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=; max-age=0;';
    document.cookie = 'docshare_uploads_backup=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=; max-age=0;';
    emitUploadsUpdated([]);
  } catch (e) {
    console.warn('Could not clear upload history from storage', e);
  }
}

export function saveAccessToken(slug: string, token: string) {
  try {
    const raw = sessionStorage.getItem(ACCESS_TOKENS_KEY) || sessionStorage.getItem(LEGACY_ACCESS_TOKENS_KEY);
    const tokens = raw ? JSON.parse(raw) : {};
    tokens[slug] = token;
    sessionStorage.setItem(ACCESS_TOKENS_KEY, JSON.stringify(tokens));
    sessionStorage.setItem(LEGACY_ACCESS_TOKENS_KEY, JSON.stringify(tokens));
  } catch {}
}

export function getAccessToken(slug: string): string | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_TOKENS_KEY) || sessionStorage.getItem(LEGACY_ACCESS_TOKENS_KEY);
    const tokens = raw ? JSON.parse(raw) : {};
    return tokens[slug] || null;
  } catch {
    return null;
  }
}

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk for high mobile reliability & fast recovery
const SINGLE_REQUEST_THRESHOLD = 4 * 1024 * 1024; // 4MB threshold: anything larger uses resilient chunking

// Helper: Upload a single chunk part with timeout & error classification
function uploadChunkPart(
  uploadId: string,
  chunkIndex: number,
  chunkBlob: Blob,
  onChunkProgress?: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('chunk', chunkBlob, `part_${chunkIndex}.bin`);

    // Set 60s timeout per 2MB chunk
    xhr.timeout = 60000;
    xhr.open('POST', apiUrl('/api/upload-chunk/part'));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onChunkProgress) {
        onChunkProgress(e.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.error || `Chunk ${chunkIndex} failed`));
        } catch {
          reject(new Error(`Chunk ${chunkIndex} upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error(`Network error uploading chunk ${chunkIndex}`));
    xhr.ontimeout = () => reject(new Error(`Timeout uploading chunk ${chunkIndex}`));

    xhr.send(formData);
  });
}

// Helper: Chunk part upload with automatic retry
async function uploadChunkPartWithRetry(
  uploadId: string,
  chunkIndex: number,
  chunkBlob: Blob,
  maxRetries = 3,
  onChunkProgress?: (loaded: number) => void
): Promise<void> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await uploadChunkPart(uploadId, chunkIndex, chunkBlob, onChunkProgress);
      return;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        // Exponential backoff wait (500ms, 1000ms, etc.)
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts`);
}

// Upload a large single file via chunks (with mobile network resilience)
async function uploadLargeFileInChunks(
  file: File,
  customSlug?: string,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  const safeFilename = file.name && file.name.trim() ? file.name : `file_${Date.now()}.bin`;
  const safeMimeType = file.type || 'application/octet-stream';
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  // 1. Init chunk upload with retry
  let uploadId = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const initRes = await fetch(apiUrl('/api/upload-chunk/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: safeFilename,
          mimeType: safeMimeType,
          totalChunks,
        }),
      });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({ error: 'Failed to init chunked upload' }));
        throw new Error(err.error || 'Failed to initialize chunk upload');
      }
      const initData = await initRes.json();
      uploadId = initData.uploadId;
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }

  // 2. Upload each chunk sequentially with individual retries
  let uploadedBytesBeforeCurrentChunk = 0;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);

    await uploadChunkPartWithRetry(uploadId, i, chunkBlob, 3, (loadedInChunk) => {
      const currentLoaded = uploadedBytesBeforeCurrentChunk + loadedInChunk;
      if (onProgress) {
        onProgress(Math.min(99, Math.round((currentLoaded / (file.size || 1)) * 100)));
      }
    });

    uploadedBytesBeforeCurrentChunk += chunkBlob.size;
    if (onProgress) {
      onProgress(Math.min(99, Math.round((uploadedBytesBeforeCurrentChunk / (file.size || 1)) * 100)));
    }
  }

  // 3. Complete chunk upload with retry
  let data: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completeRes = await fetch(apiUrl('/api/upload-chunk/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, customSlug }),
      });

      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({ error: 'Failed to assemble uploaded file' }));
        throw new Error(err.error || 'Failed to assemble uploaded file');
      }

      data = await completeRes.json();
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  if (onProgress) onProgress(100);

  if (data && (data.document || data.slug)) {
    try {
      saveMyUpload({
        slug: data.slug || data.document.slug,
        managementToken: data.managementToken,
        originalFilename: data.document?.originalFilename || safeFilename,
        size: data.document?.size || file.size,
        uploadedAt: data.document?.uploadedAt || new Date().toISOString(),
        isFolder: false,
      });
    } catch (e) {
      console.warn('Failed to save to local history', e);
    }
  }

  return data;
}

// Upload file with real progress tracking & automatic chunk fallback for mobile networks
export async function uploadFile(
  file: File,
  customSlug?: string,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  // If file is larger than 4MB, use resilient chunked upload
  if (file.size > SINGLE_REQUEST_THRESHOLD) {
    return uploadLargeFileInChunks(file, customSlug, onProgress);
  }

  // Attempt direct upload; if mobile network drops, automatically fallback to chunked upload
  try {
    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      if (customSlug) {
        formData.append('customSlug', customSlug);
      }
      formData.append('file', file);

      // 45s timeout for direct uploads under 4MB
      xhr.timeout = 45000;
      xhr.open('POST', apiUrl('/api/upload'));

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        let data: any = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (e) {}

        if (xhr.status >= 200 && xhr.status < 300) {
          if (data && (data.document || data.slug)) {
            try {
              saveMyUpload({
                slug: data.slug || data.document.slug,
                managementToken: data.managementToken,
                originalFilename: data.document.originalFilename,
                size: data.document.size,
                uploadedAt: data.document.uploadedAt,
                isFolder: false,
              });
            } catch (e) {
              console.warn('Failed to save to local history', e);
            }
            resolve(data);
            return;
          }
        }

        const errorMsg =
          (data && (data.error || data.message)) ||
          (xhr.status === 413
            ? 'Upload payload is too large for the connection.'
            : xhr.status === 504 || xhr.status === 502
            ? 'Server gateway timeout during upload. Please retry.'
            : xhr.status >= 400
            ? `Server error (${xhr.status}): ${xhr.statusText || 'Upload failed'}`
            : 'Failed to process document upload.');

        reject(new Error(errorMsg));
      };

      xhr.onerror = () => {
        reject(new Error('Network connection error during direct upload'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Direct upload timed out on mobile connection'));
      };

      xhr.send(formData);
    });
  } catch (err: any) {
    console.warn('Direct upload encountered network glitch, falling back to resilient chunked upload...', err);
    // Automatic seamless fallback for mobile networks
    return uploadLargeFileInChunks(file, customSlug, onProgress);
  }
}

// Upload a single file item into a folder session with retry and fallback
async function uploadSessionItem(
  sessionId: string,
  file: File,
  itemPath: string,
  onItemProgress?: (loaded: number) => void
): Promise<void> {
  const performUpload = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('path', itemPath);
      formData.append('file', file);

      xhr.timeout = 45000;
      xhr.open('POST', apiUrl(`/api/upload-session/${sessionId}/item`));

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onItemProgress) {
          onItemProgress(e.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            reject(new Error(res.error || `Failed to upload item ${file.name}`));
          } catch {
            reject(new Error(`Failed to upload ${file.name} (Status ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
      xhr.ontimeout = () => reject(new Error(`Timeout uploading ${file.name}`));

      xhr.send(formData);
    });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await performUpload();
      return;
    } catch (err) {
      if (attempt === 3) {
        // Fallback to chunked upload if direct session item upload failed
        try {
          await uploadSessionItemChunked(sessionId, file, itemPath, onItemProgress);
          return;
        } catch (chunkErr) {
          throw err;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
}

// Upload a large individual file into a folder session using chunking
async function uploadSessionItemChunked(
  sessionId: string,
  file: File,
  itemPath: string,
  onItemProgress?: (loaded: number) => void
): Promise<void> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  let uploadId = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const initRes = await fetch(apiUrl('/api/upload-chunk/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          totalChunks,
        }),
      });
      if (!initRes.ok) {
        throw new Error(`Failed to init chunk upload for ${file.name}`);
      }
      const initJson = await initRes.json();
      uploadId = initJson.uploadId;
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((res) => setTimeout(res, 500 * attempt));
    }
  }

  let uploadedBefore = 0;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);

    await uploadChunkPartWithRetry(uploadId, i, chunkBlob, 3, (loadedInChunk) => {
      if (onItemProgress) {
        onItemProgress(uploadedBefore + loadedInChunk);
      }
    });
    uploadedBefore += chunkBlob.size;
    if (onItemProgress) {
      onItemProgress(uploadedBefore);
    }
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completeRes = await fetch(apiUrl('/api/upload-chunk/complete-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, sessionId, itemPath }),
      });
      if (!completeRes.ok) {
        throw new Error(`Failed to link chunked file ${file.name} to folder session`);
      }
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((res) => setTimeout(res, 600 * attempt));
    }
  }
}

// Upload folder or multi-file bundle with real progress tracking & session streaming
export async function uploadBundle(
  files: File[],
  paths: string[],
  folderName?: string,
  customSlug?: string,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  if (!files || files.length === 0) {
    throw new Error('No files selected to upload.');
  }

  const clientId = getClientId();

  // 1. Initialize upload session
  const initRes = await fetch(apiUrl('/api/upload-session/init'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
    body: JSON.stringify({ folderName, customSlug, clientId }),
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({ error: 'Failed to initialize folder session' }));
    throw new Error(err.error || 'Failed to start folder upload session');
  }

  const { sessionId } = await initRes.json();

  // Total byte calculation for accurate aggregate progress
  const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0) || 1;
  const bytesLoadedPerFile = new Array(files.length).fill(0);

  const reportTotalProgress = () => {
    if (!onProgress) return;
    const loadedTotal = bytesLoadedPerFile.reduce((a, b) => a + b, 0);
    const percent = Math.min(99, Math.round((loadedTotal / totalBytes) * 100));
    onProgress(percent);
  };

  // 2. Upload files in parallel workers (2 concurrent streams for speed and responsiveness)
  const CONCURRENCY = 2;
  let fileIndex = 0;

  async function worker() {
    while (fileIndex < files.length) {
      const idx = fileIndex++;
      const file = files[idx];
      const itemPath = paths[idx] || file.name;

      if (file.size > SINGLE_REQUEST_THRESHOLD) {
        await uploadSessionItemChunked(sessionId, file, itemPath, (loaded) => {
          bytesLoadedPerFile[idx] = loaded;
          reportTotalProgress();
        });
      } else {
        await uploadSessionItem(sessionId, file, itemPath, (loaded) => {
          bytesLoadedPerFile[idx] = loaded;
          reportTotalProgress();
        });
      }

      bytesLoadedPerFile[idx] = file.size;
      reportTotalProgress();
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);

  // 3. Finalize upload session
  const finalizeRes = await fetch(apiUrl(`/api/upload-session/${sessionId}/finalize`), {
    method: 'POST',
    headers: { 'x-client-id': clientId },
  });

  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({ error: 'Failed to finalize folder bundle' }));
    throw new Error(err.error || 'Failed to finalize folder bundle');
  }

  const data = await finalizeRes.json();
  if (onProgress) onProgress(100);

  if (data && (data.document || data.slug)) {
    try {
      saveMyUpload({
        slug: data.slug || data.document.slug,
        managementToken: data.managementToken || data.document?.managementToken,
        originalFilename: data.document?.folderName || data.document?.originalFilename || folderName || 'Folder Bundle',
        size: data.document?.size || totalBytes,
        uploadedAt: data.document?.uploadedAt || new Date().toISOString(),
        isFolder: true,
        totalFiles: data.document?.totalFiles || files.length,
      });
    } catch (e) {
      console.warn('Failed to save bundle to local history', e);
    }
  }

  return data;
}

// Upload multiple files as distinct individual documents
export async function uploadMultipleSeparate(
  files: File[],
  onProgress?: (percent: number, currentFileName?: string) => void
): Promise<UploadResponse[]> {
  if (files.length === 0) {
    throw new Error('No files provided for multi upload');
  }

  const clientId = getClientId();
  const totalFiles = files.length;
  let completedCount = 0;
  const results: UploadResponse[] = [];

  // Try batch endpoint first if files are reasonable in total size (< 40MB total)
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize < 40 * 1024 * 1024 && files.length <= 50) {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('clientId', clientId);

      const xhr = new XMLHttpRequest();
      const promise = new Promise<UploadResponse[]>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent, `Uploading ${files.length} files...`);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              const items: UploadResponse[] = res.items || [];
              items.forEach((item) => {
                if (item.document) {
                  saveMyUpload({
                    slug: item.slug || item.document.slug,
                    managementToken: item.managementToken,
                    originalFilename: item.document.originalFilename,
                    size: item.document.size,
                    uploadedAt: item.document.uploadedAt,
                  });
                }
              });
              resolve(items);
            } catch (err) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            reject(new Error(`Server error: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during multi-upload')));
        xhr.open('POST', apiUrl('/api/upload-multiple-separate'));
        xhr.setRequestHeader('x-client-id', clientId);
        xhr.send(formData);
      });

      return await promise;
    } catch (e) {
      console.warn('Batch endpoint failed, falling back to concurrent uploads', e);
    }
  }

  // Fallback / Large files concurrent upload
  const CONCURRENCY = 3;
  let index = 0;

  const worker = async () => {
    while (index < files.length) {
      const currentIndex = index++;
      const file = files[currentIndex];
      if (onProgress) {
        onProgress(
          Math.round((completedCount / totalFiles) * 100),
          `Uploading ${file.name} (${currentIndex + 1}/${totalFiles})`
        );
      }

      const res = await uploadFile(file);
      results[currentIndex] = res;
      completedCount++;

      if (onProgress) {
        onProgress(
          Math.round((completedCount / totalFiles) * 100),
          `Finished ${file.name}`
        );
      }
    }
  };

  const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker());
  await Promise.all(workers);

  if (onProgress) onProgress(100, 'All files uploaded successfully');
  return results;
}

// Batch publish multiple documents
export async function publishBatch(
  request: BatchPublishRequest
): Promise<{ success: boolean; items: UploadResponse[] }> {
  const clientId = getClientId();
  const res = await fetch(apiUrl('/api/documents/publish-batch'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
    },
    body: JSON.stringify(request),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Batch publishing failed');
  }

  const items: UploadResponse[] = data.items || [];
  items.forEach((item) => {
    if (item.document) {
      saveMyUpload({
        slug: item.slug || item.document.slug,
        managementToken: item.managementToken,
        originalFilename: item.document.originalFilename,
        size: item.document.size,
        uploadedAt: item.document.uploadedAt,
        status: 'published',
      });
    }
  });

  return data;
}

// Publish document
export async function publishDocument(
  slug: string,
  managementToken: string,
  params: PublishRequest
): Promise<{ success: boolean; document: DocumentMetadata; managementToken: string }> {
  const clientId = getClientId();
  const res = await fetch(apiUrl(`/api/documents/${slug}/publish`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-management-token': managementToken,
      'x-client-id': clientId,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Publishing failed');
  }

  if (data.document?.slug) {
    if (data.document.slug !== slug) {
      removeMyUpload(slug);
    }
    saveMyUpload({
      slug: data.document.slug,
      managementToken: data.managementToken || managementToken,
      originalFilename: data.document.folderName || data.document.originalFilename,
      size: data.document.size,
      uploadedAt: data.document.uploadedAt,
      isFolder: data.document.isFolder,
      totalFiles: data.document.totalFiles,
      status: 'published',
    });
  }

  return data;
}

// Get public metadata
export async function getDocumentMetadata(
  slug: string,
  skipView: boolean = false
): Promise<{
  document: DocumentMetadata;
  requiresPassword?: boolean;
  unlocked?: boolean;
  error?: string;
  isExpired?: boolean;
}> {
  const token = getAccessToken(slug);
  const headers: Record<string, string> = {};
  if (token) {
    headers['x-access-token'] = token;
  }

  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, '');
  const url = apiUrl(`/api/documents/${cleanSlug}${skipView ? '?skipView=true' : ''}`);

  let res: Response | null = null;
  let lastNetworkError: any = null;

  // Retry up to 3 times in case of transient network change/reconnect
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { headers });
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  if (!res) {
    // If backend network request completely failed, fallback to querying Firestore directly
    const firestoreDoc = await fetchPublicDocFromFirestore(cleanSlug);
    if (firestoreDoc) {
      return {
        document: firestoreDoc as DocumentMetadata,
        requiresPassword: Boolean(firestoreDoc.hasPassword && !token),
        unlocked: !firestoreDoc.hasPassword || Boolean(token),
      };
    }
    const err = new Error(lastNetworkError?.message || 'Network connection lost. Please check your internet connection.');
    (err as any).isNetworkError = true;
    throw err;
  }

  const data = await res.json();

  if (!res.ok && res.status !== 410) {
    // If 404, check direct Firestore fallback before throwing
    if (res.status === 404) {
      const firestoreDoc = await fetchPublicDocFromFirestore(cleanSlug);
      if (firestoreDoc) {
        return {
          document: firestoreDoc as DocumentMetadata,
          requiresPassword: Boolean(firestoreDoc.hasPassword && !token),
          unlocked: !firestoreDoc.hasPassword || Boolean(token),
        };
      }
    }
    throw new Error(data.error || 'Document not found');
  }

  return data;
}

// Verify password
export async function verifyDocumentPassword(
  slug: string,
  password: string
): Promise<{ success: boolean; token: string; document: DocumentMetadata }> {
  const res = await fetch(apiUrl(`/api/documents/${slug}/verify-password`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Incorrect password');
  }

  if (data.token) {
    saveAccessToken(slug, data.token);
  }
  return data;
}

export function fallbackItemsToMetadata(
  items: MyUploadItem[],
  forceStatus?: DocumentStatus
): DocumentMetadata[] {
  return items.map((item) => {
    const isFolder = Boolean(item.isFolder);
    const filename = item.originalFilename || item.slug;
    const extension = isFolder ? 'folder' : filename.split('.').pop()?.toLowerCase() || 'bin';
    return {
      id: 'local_' + item.slug,
      slug: item.slug,
      originalFilename: filename,
      folderName: isFolder ? filename : undefined,
      extension,
      mimeType: isFolder ? 'application/zip' : 'application/octet-stream',
      size: item.size || 0,
      uploadedAt: item.uploadedAt || new Date().toISOString(),
      status: forceStatus || item.status || 'unknown',
      hasPassword: false,
      viewCount: 0,
      downloadCount: 0,
      scanStatus: 'clean',
      previewType: isFolder ? 'folder' : 'text',
      isFolder,
      totalFiles: item.totalFiles,
      managementToken: item.managementToken,
    } as DocumentMetadata;
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface MyDocumentsResult {
  documents: DocumentMetadata[];
  /** true when the server could not be reached: statuses below come from what this browser last saw */
  offline: boolean;
  /** number of saved items the server no longer knows about (shown as "Unavailable") */
  missingCount: number;
}

// Load the user's documents. The server is the source of truth for status.
// - Server reachable: server statuses are shown; items it does not know are marked "missing".
// - Server unreachable: the saved list is shown with the last known status (never invented as "published").
export async function loadMyDocuments(): Promise<MyDocumentsResult> {
  const items = getMyUploads();
  const clientId = getClientId();

  try {
    // 75 s: a sleeping free-tier server can take about a minute to wake up
    const res = await fetchWithTimeout(
      apiUrl('/api/my-documents'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
        body: JSON.stringify({ items, clientId }),
      },
      75000
    );
    if (!res.ok) throw new Error(`Server responded ${res.status}`);

    const data = await res.json();
    const serverDocs: DocumentMetadata[] = data.documents || [];
    const serverSlugs = new Set(serverDocs.map((d) => d.slug));
    const missingItems = items.filter((x) => !serverSlugs.has(x.slug));

    // Refresh the local cache quietly (no events => no refresh loops).
    // Missing items are kept so the user can still see and remove them.
    const merged: MyUploadItem[] = [
      ...serverDocs.map((doc: any) => ({
        slug: doc.slug,
        managementToken: doc.managementToken || items.find((x) => x.slug === doc.slug)?.managementToken || '',
        originalFilename: doc.folderName || doc.originalFilename,
        size: doc.size,
        uploadedAt: doc.uploadedAt,
        isFolder: doc.isFolder,
        totalFiles: doc.totalFiles,
        status: doc.status,
      })),
      ...missingItems,
    ];
    persistMyUploadsQuiet(merged);

    const documents = [...serverDocs, ...fallbackItemsToMetadata(missingItems, 'missing')].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    return { documents, offline: false, missingCount: missingItems.length };
  } catch (err) {
    console.warn('Could not reach the server, showing the saved list:', err);
    return { documents: fallbackItemsToMetadata(items), offline: true, missingCount: 0 };
  }
}

// Backwards-compatible wrapper
export async function fetchMyDocuments(): Promise<DocumentMetadata[]> {
  return (await loadMyDocuments()).documents;
}

// Update document settings (status, password, expiry, download limit)
export async function updateDocumentSettings(
  slug: string,
  managementToken: string,
  updates: any
): Promise<DocumentMetadata> {
  const res = await fetch(apiUrl(`/api/documents/${slug}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-management-token': managementToken,
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Update failed');
  }
  if (data.document?.status) {
    setMyUploadStatus(data.document.slug || slug, data.document.status);
  }
  return data.document;
}

// Delete one document. "Already gone" (404) counts as success so ghost entries can always be removed.
export async function deleteDocument(slug: string, managementToken?: string): Promise<void> {
  const clientId = getClientId();
  const res = await fetchWithTimeout(
    apiUrl(`/api/documents/${encodeURIComponent(slug)}`),
    {
      method: 'DELETE',
      headers: {
        'x-management-token': managementToken || '',
        'x-client-id': clientId,
      },
    },
    60000
  );

  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Delete failed');
  }

  removeMyUpload(slug);
  if (auth.currentUser) {
    try {
      await deleteUserDocFromCloud(auth.currentUser.uid, slug);
    } catch (e) {
      console.warn('Could not delete cloud record:', e);
    }
  }
}

export interface DeleteAllResult {
  deleted: string[];
  failed: Array<{ slug: string; error: string }>;
}

// Delete several documents. Local and cloud records are only removed for documents the server confirmed deleted.
export async function deleteAllMyDocuments(documents: DocumentMetadata[]): Promise<DeleteAllResult> {
  const localItems = getMyUploads();
  const clientId = getClientId();

  const allSlugs = new Set<string>();
  documents.forEach((d) => d?.slug && allSlugs.add(d.slug));

  const payload = Array.from(allSlugs).map((slug) => ({
    slug,
    managementToken:
      documents.find((x) => x.slug === slug)?.managementToken ||
      localItems.find((x) => x.slug === slug)?.managementToken ||
      '',
  }));

  const result: DeleteAllResult = { deleted: [], failed: [] };

  try {
    const res = await fetchWithTimeout(
      apiUrl('/api/documents/delete-batch'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': clientId },
        body: JSON.stringify({ items: payload, clientId }),
      },
      120000
    );
    if (!res.ok) throw new Error('Batch delete request failed');
    const data = await res.json();
    result.deleted = Array.isArray(data.deleted) ? data.deleted : [];
    result.failed = Array.isArray(data.failed) ? data.failed : [];
  } catch (err) {
    console.warn('Batch delete failed, falling back to one-by-one deletes:', err);
    for (const item of payload) {
      try {
        await deleteDocument(item.slug, item.managementToken); // also cleans local + cloud
        result.deleted.push(item.slug);
      } catch (e: any) {
        result.failed.push({ slug: item.slug, error: e?.message || 'Delete failed' });
      }
    }
    return result;
  }

  // Clean local + cloud records only for confirmed deletions
  for (const slug of result.deleted) {
    removeMyUpload(slug);
  }
  if (auth.currentUser && result.deleted.length > 0) {
    try {
      await deleteAllUserDocsFromCloud(auth.currentUser.uid, result.deleted);
    } catch (e) {
      console.warn('Could not delete cloud records:', e);
    }
  }
  return result;
}

// ---- Keep the (free-tier) backend awake ----
export async function pingServer(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/health'), { cache: 'no-store' }, 75000);
    return res.ok;
  } catch {
    return false;
  }
}

// Wake the server as soon as the site opens, then poll it every 14 minutes while a tab is open.
export function startServerKeepAlive(): () => void {
  pingServer();
  const id = setInterval(() => {
    pingServer();
  }, 14 * 60 * 1000);
  return () => clearInterval(id);
}

// Check custom slug availability
export async function checkSlugAvailability(slug: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/check-slug/${encodeURIComponent(slug)}`));
    const data = await res.json();
    return Boolean(data.available);
  } catch {
    return false;
  }
}

export interface ServerInfo {
  status: string;
  publicUrl: string;
  cloudAppUrl: string;
  sharedAppUrl: string;
  detectedOrigin: string;
  isCloudRun: boolean;
  guidance: {
    troubleshooting: string;
    points: string[];
  };
}

let cachedServerInfo: ServerInfo | null = null;

export async function getServerInfo(): Promise<ServerInfo | null> {
  if (cachedServerInfo) return cachedServerInfo;
  try {
    const res = await fetch(apiUrl('/api/server-info'));
    if (res.ok) {
      cachedServerInfo = await res.json();
      return cachedServerInfo;
    }
  } catch (err) {
    console.warn('Failed to fetch server info:', err);
  }
  return null;
}

export function getEffectiveBaseUrl(serverInfo?: ServerInfo | null): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If on localhost or private loopback, prefer cloud public URL so links work across devices/ethernet
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (serverInfo?.publicUrl) return serverInfo.publicUrl;
      if (serverInfo?.cloudAppUrl) return serverInfo.cloudAppUrl;
      if (serverInfo?.sharedAppUrl) return serverInfo.sharedAppUrl;
      return 'https://maketransfer.web.app';
    }
    return window.location.origin;
  }
  return serverInfo?.publicUrl || 'https://maketransfer.web.app';
}
