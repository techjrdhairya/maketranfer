import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { generateSlug, generateManagementToken, isValidSlug } from './slug.js';
import {
  persistDocumentToFirestore,
  deleteDocumentFromFirestore,
  clearDeleted,
  loadDocumentsFromFirestore,
  fetchDocumentFromFirestore,
  restoreFileFromFirestore,
  restoreFolderItemFromFirestore,
  encodeSlugForDocId,
} from './firebase.js';

export interface StoredFolderItem {
  id: string;
  path: string; // e.g. "src/components/Header.tsx" or "file.pdf"
  name: string;
  storedFilename: string;
  extension: string;
  mimeType: string;
  size: number;
  previewType: 'pdf' | 'image' | 'text' | 'markdown' | 'docx' | 'spreadsheet' | 'audio' | 'video' | 'binary' | 'folder';
}

export interface StoredDocument {
  id: string;
  slug: string;
  originalFilename: string;
  storedFilename: string;
  extension: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  publishedAt?: string;
  status: 'draft' | 'published' | 'unpublished';
  managementToken: string;
  ownerClientId?: string;
  passwordHash?: string;
  hasPassword: boolean;
  expiresAt?: string | null;
  maxDownloads?: number | null;
  viewCount: number;
  downloadCount: number;
  description?: string;
  scanStatus: 'clean' | 'scanning' | 'flagged';
  previewType: 'pdf' | 'image' | 'text' | 'markdown' | 'docx' | 'spreadsheet' | 'audio' | 'video' | 'binary' | 'folder';
  isFolder?: boolean;
  folderName?: string;
  items?: StoredFolderItem[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DB_FILE = path.join(DATA_DIR, 'documents.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function detectPreviewType(extension: string, mimeType: string): StoredDocument['previewType'] {
  const ext = extension.toLowerCase();
  if (ext === 'pdf' || mimeType.includes('pdf')) return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext) || mimeType.startsWith('image/')) return 'image';
  if (['md', 'markdown'].includes(ext) || mimeType.includes('markdown')) return 'markdown';
  if (ext === 'docx') return 'docx';
  if (['xlsx', 'xls', 'csv'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel') || ext === 'csv') return 'spreadsheet';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || mimeType.startsWith('audio/')) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || mimeType.startsWith('video/')) return 'video';
  if (
    ['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'scss', 'xml', 'yaml', 'yml', 'sh', 'sql', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'log', 'env', 'toml', 'ini', 'dockerfile', 'graphql'].includes(ext) ||
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('javascript')
  ) {
    return 'text';
  }
  return 'binary';
}

class StorageService {
  private documents: Map<string, StoredDocument> = new Map();
  private uploadSessions: Map<string, {
    id: string;
    folderName?: string;
    customSlug?: string;
    ownerClientId?: string;
    items: StoredFolderItem[];
    totalSize: number;
    createdAt: number;
  }> = new Map();
  private chunkUploads: Map<string, {
    id: string;
    filename: string;
    mimeType: string;
    totalChunks: number;
    ownerClientId?: string;
    receivedChunks: Set<number>;
    tempDir: string;
    createdAt: number;
  }> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.loadFromDisk();
    this.initPromise = this.syncFromFirestore();

    // Clean up stale sessions periodically (older than 2 hours)
    this.cleanStaleUploads();
    setInterval(() => {
      this.cleanStaleUploads();
    }, 15 * 60 * 1000);
  }

  public cleanStaleUploads(maxAgeMs: number = 2 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, session] of this.uploadSessions.entries()) {
      if (session.createdAt < cutoff) {
        if (Array.isArray(session.items)) {
          for (const item of session.items) {
            if (item.storedFilename) {
              const itemPath = path.join(UPLOADS_DIR, item.storedFilename);
              try {
                if (fs.existsSync(itemPath)) {
                  fs.unlinkSync(itemPath);
                }
              } catch (e) {}
            }
          }
        }
        this.uploadSessions.delete(id);
      }
    }
    for (const [id, chunk] of this.chunkUploads.entries()) {
      if (chunk.createdAt < cutoff) {
        try {
          if (fs.existsSync(chunk.tempDir)) {
            fs.rmSync(chunk.tempDir, { recursive: true, force: true });
          }
        } catch (e) {}
        this.chunkUploads.delete(id);
      }
    }

    // Disk sweep for any orphaned tmp_ directories
    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('tmp_')) {
            const dirPath = path.join(UPLOADS_DIR, entry.name);
            try {
              const stat = fs.statSync(dirPath);
              if (stat.mtimeMs < cutoff) {
                fs.rmSync(dirPath, { recursive: true, force: true });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  public cancelUploadSession(sessionId: string): boolean {
    const session = this.uploadSessions.get(sessionId);
    if (!session) return false;
    if (Array.isArray(session.items)) {
      for (const item of session.items) {
        if (item.storedFilename) {
          const itemPath = path.join(UPLOADS_DIR, item.storedFilename);
          try {
            if (fs.existsSync(itemPath)) {
              fs.unlinkSync(itemPath);
            }
          } catch (e) {}
        }
      }
    }
    this.uploadSessions.delete(sessionId);
    return true;
  }

  public cancelChunkUpload(uploadId: string): boolean {
    const chunk = this.chunkUploads.get(uploadId);
    if (!chunk) return false;
    try {
      if (fs.existsSync(chunk.tempDir)) {
        fs.rmSync(chunk.tempDir, { recursive: true, force: true });
      }
    } catch (e) {}
    this.chunkUploads.delete(uploadId);
    return true;
  }

  public async waitForInit(): Promise<void> {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (err) {
        console.warn('Wait for init had error:', err);
      }
    }
  }

  private async syncFromFirestore() {
    try {
      const firestoreDocs = await loadDocumentsFromFirestore(UPLOADS_DIR);
      let newCount = 0;
      for (const doc of firestoreDocs) {
        if (doc && doc.slug) {
          const cleanSlug = doc.slug.trim().replace(/^\/+|\/+$/g, '');
          if (!this.documents.has(cleanSlug) && !this.documents.has(doc.slug)) {
            this.documents.set(cleanSlug, doc);
            newCount++;
          }
        }
      }
      if (newCount > 0) {
        console.log(`Integrated ${newCount} restored documents from Cloud Firestore.`);
        this.saveToDisk(false);
      }
    } catch (err) {
      console.warn('Firestore initial sync encountered error (will retry on demand):', err);
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const docsArray: StoredDocument[] = JSON.parse(raw);
        this.documents.clear();
        docsArray.forEach((doc) => {
          if (doc && doc.slug) {
            this.documents.set(doc.slug, doc);
          }
        });
        console.log(`Loaded ${this.documents.size} documents from disk storage.`);
      }
    } catch (err) {
      console.error('Failed to load database from disk:', err);
    }
  }

  private saveToDisk(syncFirestore: boolean = false) {
    let tempFile: string | null = null;
    try {
      // Deduplicate unique documents before serializing
      const seenKeys = new Set<string>();
      const uniqueDocs: StoredDocument[] = [];
      for (const doc of this.documents.values()) {
        const key = (doc.id || doc.slug || '').trim();
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueDocs.push(doc);
        }
      }

      const data = JSON.stringify(uniqueDocs, null, 2);
      tempFile = `${DB_FILE}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;
      fs.writeFileSync(tempFile, data, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database to disk atomically:', err);
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
    }
  }

  public persistDoc(doc: StoredDocument): void {
    if (doc) {
      persistDocumentToFirestore(doc, UPLOADS_DIR).catch((err) => {
        console.warn(`Error persisting document ${doc.slug}:`, err);
      });
    }
  }

  public async ensureFileOnDisk(doc: StoredDocument, item?: StoredFolderItem): Promise<boolean> {
    if (!doc) return false;
    const cleanSlug = (doc.slug || '').trim().replace(/^\/+|\/+$/g, '');
    const docId = encodeSlugForDocId(cleanSlug);

    if (doc.isFolder && item) {
      const itemPath = this.getFolderItemFilePath(item);
      if (fs.existsSync(itemPath)) return true;
      console.log(`Folder item ${item.name} (${item.storedFilename}) missing on disk. Restoring from Firestore...`);
      return await restoreFolderItemFromFirestore(docId, item, UPLOADS_DIR);
    }

    if (!doc.isFolder && doc.storedFilename) {
      const filePath = this.getFilePath(doc);
      if (fs.existsSync(filePath)) return true;
      console.log(`Document file ${doc.storedFilename} missing on disk. Restoring from Firestore...`);
      return await restoreFileFromFirestore(docId, doc, UPLOADS_DIR);
    }

    return false;
  }

  public async ensureAllFolderItemsOnDisk(doc: StoredDocument): Promise<void> {
    if (!doc || !doc.isFolder || !Array.isArray(doc.items)) return;
    const cleanSlug = (doc.slug || '').trim().replace(/^\/+|\/+$/g, '');
    const docId = encodeSlugForDocId(cleanSlug);

    for (const item of doc.items) {
      const itemPath = this.getFolderItemFilePath(item);
      if (!fs.existsSync(itemPath)) {
        await restoreFolderItemFromFirestore(docId, item, UPLOADS_DIR);
      }
    }
  }

  public getUploadsPath(): string {
    return UPLOADS_DIR;
  }

  public isSlugAvailable(slug: string): boolean {
    if (!slug) return false;
    const clean = slug.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return false;
    return !this.getBySlug(clean);
  }

  public generateUniqueSlug(length: number = 6): string {
    let slug = generateSlug(length);
    let attempts = 0;
    while (!this.isSlugAvailable(slug) && attempts < 20) {
      slug = generateSlug(length + Math.floor(attempts / 5));
      attempts++;
    }
    return slug;
  }

  public createDocument(file: Express.Multer.File, options?: { customSlug?: string; ownerClientId?: string }): StoredDocument {
    let slug: string;
    if (options?.customSlug) {
      const requested = options.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!this.isSlugAvailable(requested)) {
        throw new Error(`Custom link "${requested}" is already in use`);
      }
      slug = requested;
    } else {
      slug = this.generateUniqueSlug();
    }

    const extension = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';
    const previewType = detectPreviewType(extension, file.mimetype);

    // Basic heuristic scan for malicious executable extensions
    const suspiciousExts = ['exe', 'bat', 'cmd', 'vbs', 'scr', 'pif'];
    const scanStatus = suspiciousExts.includes(extension) ? 'flagged' : 'clean';

    const doc: StoredDocument = {
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      slug,
      originalFilename: file.originalname,
      storedFilename: file.filename,
      extension,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      uploadedAt: new Date().toISOString(),
      status: 'draft',
      managementToken: generateManagementToken(),
      ownerClientId: options?.ownerClientId,
      hasPassword: false,
      viewCount: 0,
      downloadCount: 0,
      scanStatus,
      previewType,
      isFolder: false,
    };

    this.documents.set(slug, doc);
    this.saveToDisk(false);
    this.persistDoc(doc);
    return doc;
  }

  public createFolderBundle(
    files: Express.Multer.File[],
    filePaths: string[],
    options?: { folderName?: string; customSlug?: string; ownerClientId?: string }
  ): StoredDocument {
    let slug: string;
    if (options?.customSlug) {
      const requested = options.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!this.isSlugAvailable(requested)) {
        throw new Error(`Custom link "${requested}" is already in use`);
      }
      slug = requested;
    } else {
      slug = this.generateUniqueSlug();
    }

    const folderName = (options?.folderName && options.folderName.trim()) || 'Collection-' + slug;
    let totalSize = 0;
    let anyFlagged = false;
    const suspiciousExts = ['exe', 'bat', 'cmd', 'vbs', 'scr', 'pif'];

    const items: StoredFolderItem[] = files.map((file, idx) => {
      totalSize += file.size;
      const originalPath = filePaths[idx] || file.originalname;
      const extension = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';
      const previewType = detectPreviewType(extension, file.mimetype);
      if (suspiciousExts.includes(extension)) anyFlagged = true;

      return {
        id: 'item_' + idx + '_' + Math.random().toString(36).substring(2, 6),
        path: originalPath,
        name: path.basename(originalPath) || file.originalname,
        storedFilename: file.filename,
        extension,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        previewType,
      };
    });

    const doc: StoredDocument = {
      id: 'doc_folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      slug,
      originalFilename: folderName,
      folderName,
      storedFilename: '', // multi-file folder
      extension: 'folder',
      mimeType: 'application/zip',
      size: totalSize,
      uploadedAt: new Date().toISOString(),
      status: 'draft',
      managementToken: generateManagementToken(),
      ownerClientId: options?.ownerClientId,
      hasPassword: false,
      viewCount: 0,
      downloadCount: 0,
      scanStatus: anyFlagged ? 'flagged' : 'clean',
      previewType: 'folder',
      isFolder: true,
      items,
    };

    this.documents.set(slug, doc);
    this.saveToDisk(false);
    this.persistDoc(doc);
    return doc;
  }

  // --- Session-based Multi-File / Folder Upload Methods ---
  public createUploadSession(options?: { folderName?: string; customSlug?: string; ownerClientId?: string }): {
    sessionId: string;
    folderName: string;
    customSlug?: string;
  } {
    if (options?.customSlug) {
      const requested = options.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!this.isSlugAvailable(requested)) {
        throw new Error(`Custom link "${requested}" is already in use`);
      }
    }

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const folderName = (options?.folderName && options.folderName.trim()) || 'Collection';
    
    this.uploadSessions.set(sessionId, {
      id: sessionId,
      folderName,
      customSlug: options?.customSlug,
      ownerClientId: options?.ownerClientId,
      items: [],
      totalSize: 0,
      createdAt: Date.now(),
    });

    return { sessionId, folderName, customSlug: options?.customSlug };
  }

  public addSessionItem(
    sessionId: string,
    file: Express.Multer.File,
    originalPath: string
  ): { success: boolean; error?: string; item?: StoredFolderItem } {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Upload session expired or not found' };
    }

    const itemPath = originalPath || file.originalname;
    const extension = path.extname(file.originalname).replace('.', '').toLowerCase() || 'bin';
    const previewType = detectPreviewType(extension, file.mimetype);

    const item: StoredFolderItem = {
      id: 'item_' + session.items.length + '_' + Math.random().toString(36).substring(2, 7),
      path: itemPath,
      name: path.basename(itemPath) || file.originalname,
      storedFilename: file.filename,
      extension,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      previewType,
    };

    session.items.push(item);
    session.totalSize += file.size;

    return { success: true, item };
  }

  public finalizeUploadSession(sessionId: string): { doc?: StoredDocument; error?: string } {
    const session = this.uploadSessions.get(sessionId);
    if (!session) {
      return { error: 'Upload session expired or not found' };
    }

    if (session.items.length === 0) {
      return { error: 'No files were uploaded to this bundle session.' };
    }

    let slug: string;
    if (session.customSlug) {
      const requested = session.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!this.isSlugAvailable(requested)) {
        return { error: `Custom link "${requested}" is already in use` };
      }
      slug = requested;
    } else {
      slug = this.generateUniqueSlug();
    }

    let anyFlagged = false;
    const suspiciousExts = ['exe', 'bat', 'cmd', 'vbs', 'scr', 'pif'];
    for (const it of session.items) {
      if (suspiciousExts.includes(it.extension)) anyFlagged = true;
    }

    const doc: StoredDocument = {
      id: 'doc_folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      slug,
      originalFilename: session.folderName || 'Collection-' + slug,
      folderName: session.folderName || 'Collection-' + slug,
      storedFilename: '',
      extension: 'folder',
      mimeType: 'application/zip',
      size: session.totalSize,
      uploadedAt: new Date().toISOString(),
      status: 'draft',
      managementToken: generateManagementToken(),
      ownerClientId: session.ownerClientId,
      hasPassword: false,
      viewCount: 0,
      downloadCount: 0,
      scanStatus: anyFlagged ? 'flagged' : 'clean',
      previewType: 'folder',
      isFolder: true,
      items: session.items,
    };

    this.documents.set(slug, doc);
    this.saveToDisk(false);
    this.persistDoc(doc);
    this.uploadSessions.delete(sessionId);

    return { doc };
  }

  // --- Chunked Upload Engine (for arbitrary large files) ---
  public initChunkUpload(filename: string, mimeType: string, totalChunks: number, ownerClientId?: string): { uploadId: string } {
    const uploadId = 'chunk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const tempDir = path.join(UPLOADS_DIR, 'tmp_' + uploadId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    this.chunkUploads.set(uploadId, {
      id: uploadId,
      filename,
      mimeType: mimeType || 'application/octet-stream',
      totalChunks,
      ownerClientId,
      receivedChunks: new Set(),
      tempDir,
      createdAt: Date.now(),
    });

    return { uploadId };
  }

  public saveChunkPart(uploadId: string, chunkIndex: number, chunkBuffer: Buffer): { success: boolean; error?: string } {
    const chunkUpload = this.chunkUploads.get(uploadId);
    if (!chunkUpload) {
      return { success: false, error: 'Chunk upload session not found' };
    }

    const chunkPath = path.join(chunkUpload.tempDir, `part_${chunkIndex}.tmp`);
    fs.writeFileSync(chunkPath, chunkBuffer);
    chunkUpload.receivedChunks.add(chunkIndex);

    return { success: true };
  }

  public completeChunkUpload(uploadId: string, customSlug?: string, ownerClientId?: string): { doc?: StoredDocument; fileRecord?: Express.Multer.File; error?: string } {
    if (customSlug) {
      const requested = customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!this.isSlugAvailable(requested)) {
        return { error: `Custom link "${requested}" is already in use` };
      }
    }

    const chunkUpload = this.chunkUploads.get(uploadId);
    if (!chunkUpload) {
      return { error: 'Chunk upload session not found' };
    }

    if (chunkUpload.receivedChunks.size < chunkUpload.totalChunks) {
      return { error: `Missing chunks: received ${chunkUpload.receivedChunks.size} of ${chunkUpload.totalChunks}` };
    }

    const ext = path.extname(chunkUpload.filename);
    const storedFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destinationPath = path.join(UPLOADS_DIR, storedFilename);

    // Synchronously merge chunks into destination file
    if (fs.existsSync(destinationPath)) {
      fs.unlinkSync(destinationPath);
    }
    const fd = fs.openSync(destinationPath, 'w');
    for (let i = 0; i < chunkUpload.totalChunks; i++) {
      const partPath = path.join(chunkUpload.tempDir, `part_${i}.tmp`);
      if (fs.existsSync(partPath)) {
        const data = fs.readFileSync(partPath);
        fs.writeSync(fd, data);
      }
    }
    fs.closeSync(fd);

    // Clean up temp directory
    try {
      fs.rmSync(chunkUpload.tempDir, { recursive: true, force: true });
    } catch (e) {}
    const finalOwner = ownerClientId || chunkUpload.ownerClientId;
    this.chunkUploads.delete(uploadId);

    const stats = fs.statSync(destinationPath);
    const fileRecord: Express.Multer.File = {
      fieldname: 'file',
      originalname: chunkUpload.filename,
      encoding: '7bit',
      mimetype: chunkUpload.mimeType,
      size: stats.size,
      destination: UPLOADS_DIR,
      filename: storedFilename,
      path: destinationPath,
      buffer: Buffer.alloc(0),
      stream: null as any,
    };

    const doc = this.createDocument(fileRecord, { customSlug, ownerClientId: finalOwner });
    return { doc, fileRecord };
  }

  public completeChunkForSession(uploadId: string, sessionId: string, itemPath: string): { success: boolean; error?: string; item?: StoredFolderItem } {
    const chunkUpload = this.chunkUploads.get(uploadId);
    if (!chunkUpload) {
      return { success: false, error: 'Chunk upload session not found' };
    }

    if (chunkUpload.receivedChunks.size < chunkUpload.totalChunks) {
      return { success: false, error: `Missing chunks: received ${chunkUpload.receivedChunks.size} of ${chunkUpload.totalChunks}` };
    }

    const ext = path.extname(chunkUpload.filename);
    const storedFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destinationPath = path.join(UPLOADS_DIR, storedFilename);

    // Synchronously merge chunks
    if (fs.existsSync(destinationPath)) {
      fs.unlinkSync(destinationPath);
    }
    const fd = fs.openSync(destinationPath, 'w');
    for (let i = 0; i < chunkUpload.totalChunks; i++) {
      const partPath = path.join(chunkUpload.tempDir, `part_${i}.tmp`);
      if (fs.existsSync(partPath)) {
        const data = fs.readFileSync(partPath);
        fs.writeSync(fd, data);
      }
    }
    fs.closeSync(fd);

    try {
      fs.rmSync(chunkUpload.tempDir, { recursive: true, force: true });
    } catch (e) {}
    this.chunkUploads.delete(uploadId);

    const stats = fs.statSync(destinationPath);
    const fileRecord: Express.Multer.File = {
      fieldname: 'file',
      originalname: chunkUpload.filename,
      encoding: '7bit',
      mimetype: chunkUpload.mimeType,
      size: stats.size,
      destination: UPLOADS_DIR,
      filename: storedFilename,
      path: destinationPath,
      buffer: Buffer.alloc(0),
      stream: null as any,
    };

    return this.addSessionItem(sessionId, fileRecord, itemPath);
  }

  public async publishDocument(
    slug: string,
    managementToken: string,
    options: {
      password?: string;
      expiresIn?: string;
      maxDownloads?: number | null;
      description?: string;
      customSlug?: string;
    }
  ): Promise<{ doc?: StoredDocument; error?: string }> {
    const cleanSlug = (slug || '').trim().replace(/^\/+|\/+$/g, '');
    let doc = this.documents.get(cleanSlug) || this.documents.get(slug);
    if (!doc) {
      doc = await this.getBySlugAsync(cleanSlug);
    }
    if (!doc) {
      return { error: 'Document not found' };
    }

    if (doc.managementToken !== managementToken) {
      return { error: 'Unauthorized: invalid management token' };
    }

    // Handle custom slug rename if requested
    if (options.customSlug && options.customSlug !== slug) {
      const sanitized = options.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!isValidSlug(sanitized)) {
        return { error: 'Custom URL must be 3-64 characters with letters, numbers, dashes, underscores or slashes (e.g. project/file).' };
      }
      if (this.documents.has(sanitized)) {
        return { error: 'This custom URL is already in use. Please choose another.' };
      }
      const oldSlug = doc.slug;
      this.documents.delete(oldSlug);
      this.documents.delete(cleanSlug);
      this.documents.delete(slug);
      deleteDocumentFromFirestore(oldSlug, doc.isFolder, doc.id).catch(() => {});
      clearDeleted(sanitized);
      doc.slug = sanitized;
      this.documents.set(sanitized, doc);
    }

    // Expiration calculation
    let expiresAt: string | null = null;
    if (options.expiresIn && options.expiresIn !== 'never') {
      const now = Date.now();
      if (options.expiresIn === '1h') expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
      else if (options.expiresIn === '24h') expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      else if (options.expiresIn === '7d') expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (options.expiresIn === '30d') expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      else {
        // Custom ISO or timestamp
        const parsed = new Date(options.expiresIn);
        if (!isNaN(parsed.getTime())) {
          expiresAt = parsed.toISOString();
        }
      }
    }

    if (options.password && options.password.trim().length > 0) {
      doc.passwordHash = bcrypt.hashSync(options.password.trim(), 10);
      doc.hasPassword = true;
    } else if (options.password === '') {
      doc.passwordHash = undefined;
      doc.hasPassword = false;
    }

    doc.status = 'published';
    doc.publishedAt = new Date().toISOString();
    doc.expiresAt = expiresAt;
    doc.maxDownloads = options.maxDownloads !== undefined ? options.maxDownloads : doc.maxDownloads;
    doc.description = options.description !== undefined ? options.description : doc.description;

    this.saveToDisk(false);
    this.persistDoc(doc);
    return { doc };
  }

  public getBySlug(slug: string): StoredDocument | undefined {
    if (!slug) return undefined;
    const clean = slug.trim().replace(/^\/+|\/+$/g, '');
    let doc =
      this.documents.get(clean) ||
      this.documents.get(slug) ||
      this.documents.get(clean.toLowerCase()) ||
      this.documents.get(slug.toLowerCase());
    if (doc) return doc;
    for (const d of this.documents.values()) {
      if (
        d.slug === clean ||
        d.slug === slug ||
        d.slug?.toLowerCase() === clean.toLowerCase() ||
        d.id === clean ||
        d.id === slug
      ) {
        return d;
      }
    }
    return undefined;
  }

  public async getBySlugAsync(slug: string): Promise<StoredDocument | undefined> {
    if (!slug) return undefined;
    await this.waitForInit();

    const clean = slug.trim().replace(/^\/+|\/+$/g, '');
    let doc =
      this.documents.get(clean) ||
      this.documents.get(slug) ||
      this.documents.get(clean.toLowerCase()) ||
      this.documents.get(slug.toLowerCase());

    if (!doc) {
      // Linear scan in memory to match by slug or id
      for (const d of this.documents.values()) {
        if (
          d.slug === clean ||
          d.slug === slug ||
          d.slug?.toLowerCase() === clean.toLowerCase() ||
          d.id === clean ||
          d.id === slug
        ) {
          doc = d;
          break;
        }
      }
    }

    if (!doc) {
      // Reload disk DB if not in memory (e.g. freshly written or container scale-up)
      this.loadFromDisk();
      doc =
        this.documents.get(clean) ||
        this.documents.get(slug) ||
        this.documents.get(clean.toLowerCase());
      if (!doc) {
        for (const d of this.documents.values()) {
          if (
            d.slug === clean ||
            d.slug === slug ||
            d.slug?.toLowerCase() === clean.toLowerCase() ||
            d.id === clean
          ) {
            doc = d;
            break;
          }
        }
      }
    }

    if (doc) {
      // In background, ensure file is on disk if needed
      this.ensureFileOnDisk(doc).catch(() => {});
      return doc;
    }

    try {
      const cloudDoc = await fetchDocumentFromFirestore(clean, UPLOADS_DIR);
      if (cloudDoc && cloudDoc.slug) {
        this.documents.set(cloudDoc.slug, cloudDoc);
        this.saveToDisk(false);
        return cloudDoc;
      }
    } catch (err) {
      console.warn(`Error fetching document ${clean} on-demand from Firestore:`, err);
    }
    return undefined;
  }

  // Hand a document over to someone else (device transfer): the old management token stops working
  // and the original uploader no longer sees it in their own list.
  public transferOwnership(slug: string): string | undefined {
    const doc = this.getBySlug(slug);
    if (!doc) return undefined;
    doc.managementToken = generateManagementToken();
    doc.ownerClientId = undefined;
    this.saveToDisk(false);
    this.persistDoc(doc);
    return doc.managementToken;
  }

  public getDocumentsByOwner(ownerClientId: string): StoredDocument[] {
    if (!ownerClientId) return [];
    const list: StoredDocument[] = [];
    for (const doc of this.documents.values()) {
      if (doc.ownerClientId === ownerClientId) {
        list.push(doc);
      }
    }
    return list;
  }

  public checkIsExpired(doc: StoredDocument): boolean {
    if (!doc.expiresAt) return false;
    return new Date(doc.expiresAt).getTime() < Date.now();
  }

  public checkIsDownloadLimitReached(doc: StoredDocument): boolean {
    if (doc.maxDownloads && doc.maxDownloads > 0) {
      return doc.downloadCount >= doc.maxDownloads;
    }
    return false;
  }

  public incrementView(slug: string): void {
    const doc = this.getBySlug(slug);
    if (doc) {
      doc.viewCount = (doc.viewCount || 0) + 1;
      this.saveToDisk(false);
    }
  }

  public incrementDownload(slug: string): void {
    const doc = this.getBySlug(slug);
    if (doc) {
      doc.downloadCount = (doc.downloadCount || 0) + 1;
      this.saveToDisk(false);
    }
  }

  public verifyPassword(doc: StoredDocument, passwordAttempt: string): boolean {
    if (!doc.passwordHash) return true;
    return bcrypt.compareSync(passwordAttempt, doc.passwordHash);
  }

  public async updateDocument(
    slug: string,
    managementToken: string,
    updates: {
      status?: 'draft' | 'published' | 'unpublished';
      description?: string;
      password?: string | null;
      expiresAt?: string | null;
      maxDownloads?: number | null;
      customSlug?: string;
      originalFilename?: string;
    }
  ): Promise<{ doc?: StoredDocument; error?: string }> {
    const cleanSlug = (slug || '').trim().replace(/^\/+|\/+$/g, '');
    let doc = this.documents.get(cleanSlug) || this.documents.get(slug);
    if (!doc) {
      doc = await this.getBySlugAsync(cleanSlug);
    }
    if (!doc) return { error: 'Document not found' };
    if (doc.managementToken !== managementToken) return { error: 'Unauthorized' };

    // Handle custom slug rename if requested
    if (updates.customSlug && updates.customSlug !== slug) {
      const sanitized = updates.customSlug.trim().replace(/^\/+|\/+$/g, '');
      if (!isValidSlug(sanitized)) {
        return { error: 'Custom URL must be 3-64 characters with letters, numbers, dashes, underscores or slashes (e.g. project/file).' };
      }
      if (this.documents.has(sanitized)) {
        return { error: 'This custom URL is already in use. Please choose another.' };
      }
      const oldSlug = doc.slug;
      this.documents.delete(oldSlug);
      this.documents.delete(cleanSlug);
      this.documents.delete(slug);
      deleteDocumentFromFirestore(oldSlug, doc.isFolder, doc.id).catch(() => {});
      clearDeleted(sanitized);
      doc.slug = sanitized;
      this.documents.set(sanitized, doc);
    }

    if (updates.originalFilename && updates.originalFilename.trim()) {
      doc.originalFilename = updates.originalFilename.trim();
    }

    if (updates.status) {
      if (updates.status !== 'published' && updates.status !== 'unpublished') {
        return { error: 'Invalid status. Use "published" or "unpublished".' };
      }
      if (updates.status === 'published' && doc.status !== 'published') {
        doc.publishedAt = new Date().toISOString();
      }
      doc.status = updates.status;
    }
    if (updates.description !== undefined) doc.description = updates.description;
    if (updates.expiresAt !== undefined) doc.expiresAt = updates.expiresAt;
    if (updates.maxDownloads !== undefined) doc.maxDownloads = updates.maxDownloads;

    if (updates.password !== undefined) {
      if (updates.password && updates.password.trim().length > 0) {
        doc.passwordHash = bcrypt.hashSync(updates.password.trim(), 10);
        doc.hasPassword = true;
      } else {
        doc.passwordHash = undefined;
        doc.hasPassword = false;
      }
    }

    this.saveToDisk(false);
    this.persistDoc(doc);
    return { doc };
  }

  public async deleteDocument(
    slug: string,
    managementToken?: string,
    clientId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanSlug = (slug || '').trim().replace(/^\/+|\/+$/g, '');
    let doc = this.documents.get(cleanSlug) || this.documents.get(slug);
    if (!doc) {
      doc = await this.getBySlugAsync(cleanSlug);
    }
    if (!doc) return { success: false, error: 'Document not found' };

    const isTokenValid = Boolean(managementToken && doc.managementToken === managementToken);
    const isClientValid = Boolean(clientId && doc.ownerClientId && doc.ownerClientId === clientId);

    if (!isTokenValid && !isClientValid) {
      return { success: false, error: 'Unauthorized: valid management token or document owner required' };
    }

    return await this.forceDeleteDocument(cleanSlug);
  }

  public async forceDeleteDocument(slug: string): Promise<{ success: boolean; error?: string }> {
    const cleanSlug = (slug || '').trim().replace(/^\/+|\/+$/g, '');
    let doc = this.documents.get(cleanSlug) || this.documents.get(slug);
    if (!doc) {
      doc = await this.getBySlugAsync(cleanSlug);
    }

    // Remove from Firestore first (awaited, tombstoned, retried in background if it fails)
    // so the document can never be restored from the cloud after "delete".
    await deleteDocumentFromFirestore(cleanSlug, doc?.isFolder, doc?.id);
    if (doc?.slug && doc.slug !== cleanSlug) {
      await deleteDocumentFromFirestore(doc.slug, doc.isFolder, doc.id);
    }

    if (!doc) {
      this.documents.delete(cleanSlug);
      this.documents.delete(slug);
      this.saveToDisk();
      return { success: true };
    }

    // Delete stored files
    if (doc.isFolder && doc.items && doc.items.length > 0) {
      for (const item of doc.items) {
        const filePath = path.join(UPLOADS_DIR, item.storedFilename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (err) {
            console.warn('Could not delete item file from disk:', err);
          }
        }
      }
    } else if (doc.storedFilename) {
      const filePath = path.join(UPLOADS_DIR, doc.storedFilename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.warn('Could not delete file from disk:', err);
        }
      }
    }

    if (doc.slug) {
      this.documents.delete(doc.slug);
    }
    this.documents.delete(cleanSlug);
    this.documents.delete(slug);
    this.saveToDisk();
    return { success: true };
  }

  public async deleteDocumentsByOwner(ownerClientId: string): Promise<number> {
    if (!ownerClientId) return 0;
    await this.waitForInit();
    const toDelete: StoredDocument[] = [];
    for (const doc of this.documents.values()) {
      if (doc.ownerClientId === ownerClientId && !toDelete.some((d) => d.slug === doc.slug)) {
        toDelete.push(doc);
      }
    }
    let count = 0;
    for (const doc of toDelete) {
      const res = await this.forceDeleteDocument(doc.slug);
      if (res.success) {
        count++;
      }
    }
    return count;
  }

  public sanitizeForPublic(doc: StoredDocument): any {
    const isExpired = this.checkIsExpired(doc);
    const isLimitReached = this.checkIsDownloadLimitReached(doc);

    return {
      id: doc.id,
      slug: doc.slug,
      originalFilename: doc.originalFilename,
      folderName: doc.folderName,
      isFolder: doc.isFolder || false,
      extension: doc.extension,
      mimeType: doc.mimeType,
      size: doc.size,
      uploadedAt: doc.uploadedAt,
      publishedAt: doc.publishedAt,
      status: isExpired ? 'expired' : doc.status,
      hasPassword: doc.hasPassword,
      expiresAt: doc.expiresAt,
      maxDownloads: doc.maxDownloads,
      viewCount: doc.viewCount,
      downloadCount: doc.downloadCount,
      description: doc.description,
      scanStatus: doc.scanStatus,
      previewType: doc.previewType,
      isExpired,
      isLimitReached,
      totalFiles: doc.items ? doc.items.length : 1,
      items: doc.items ? doc.items.map((it, idx) => ({
        id: it.id,
        index: idx,
        path: it.path,
        name: it.name,
        extension: it.extension,
        mimeType: it.mimeType,
        size: it.size,
        previewType: it.previewType,
      })) : undefined,
    };
  }

  public getFilePath(doc: StoredDocument): string {
    return path.join(UPLOADS_DIR, doc.storedFilename);
  }

  public getFolderItemFilePath(item: StoredFolderItem): string {
    return path.join(UPLOADS_DIR, item.storedFilename);
  }

  public findFolderItem(doc: StoredDocument, pathOrIndex: string | number): StoredFolderItem | undefined {
    if (!doc.items || doc.items.length === 0) return undefined;
    if (typeof pathOrIndex === 'number' || (!isNaN(Number(pathOrIndex)) && !pathOrIndex.includes('/') && !pathOrIndex.includes('.'))) {
      const idx = Number(pathOrIndex);
      return doc.items[idx];
    }
    const query = String(pathOrIndex).trim().replace(/^\/+/, '');
    return doc.items.find(
      (it) => it.path === query || it.name === query || it.id === query || it.path.replace(/^\/+/, '') === query
    );
  }
}

export const storage = new StorageService();
