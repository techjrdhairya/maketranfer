import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import * as archiverModule from 'archiver';
import { createServer as createViteServer } from 'vite';
import { storage } from './server/storage.js';
import { isValidSlug } from './server/slug.js';
import { registerDeviceRoutes } from './server/devices.js';

function createZipArchive(options?: any) {
  const mod = archiverModule as any;
  if (typeof mod.ZipArchive === 'function') {
    return new mod.ZipArchive(options);
  }
  if (typeof mod.default === 'function') {
    return mod.default('zip', options);
  }
  if (typeof mod === 'function') {
    return mod('zip', options);
  }
  throw new Error('Could not instantiate zip archive');
}

const PORT = Number(process.env.PORT) || 3000;
const MAX_BUNDLE_FILES = 2000; // Large batch threshold for multi-file collections

// Helper to sign a temporary access token for password-protected files
const SECRET_KEY = process.env.SESSION_SECRET || 'maketransfer-jwt-secret-' + Date.now();
function generateAccessToken(slug: string): string {
  const payload = `${slug}:${Date.now() + 24 * 60 * 60 * 1000}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

function verifyAccessToken(slug: string, token: string): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8');
    const [tokenSlug, expiresStr, hmac] = raw.split(':');
    if (tokenSlug !== slug) return false;
    if (Date.now() > Number(expiresStr)) return false;
    const expectedHmac = crypto.createHmac('sha256', SECRET_KEY).update(`${tokenSlug}:${expiresStr}`).digest('hex');
    return hmac === expectedHmac;
  } catch {
    return false;
  }
}

// Multer configuration - unlimited file size streaming to disk
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storage.getUploadsPath());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fieldSize: 100 * 1024 * 1024, // 100MB for metadata fields
    fields: 10000,
    files: MAX_BUNDLE_FILES,
  },
});

function getRequestClientId(req: express.Request): string | undefined {
  const headerId = req.headers['x-client-id'];
  if (typeof headerId === 'string' && headerId.trim()) return headerId.trim();
  if (req.body?.clientId && typeof req.body.clientId === 'string') return req.body.clientId.trim();
  if (req.query?.clientId && typeof req.query.clientId === 'string') return req.query.clientId.trim();
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/(?:maketransfer_client_id|docshare_client_id)=([^;]+)/);
    if (match) return match[1].trim();
  }
  return undefined;
}

async function startServer() {
  const app = express();

  // CORS & Preflight support for all devices and mobile browsers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-client-id, x-access-token, x-doc-password, x-management-token, Range');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Disposition');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Helper for password authorization
  const checkAccess = (doc: any, req: express.Request): boolean => {
    if (!doc.hasPassword) return true;
    const token = (req.query.token as string) || (req.headers['x-access-token'] as string);
    if (token && verifyAccessToken(doc.slug, token)) return true;
    const pwd = (req.query.pwd as string) || (req.headers['x-doc-password'] as string);
    if (pwd && storage.verifyPassword(doc, pwd)) return true;
    return false;
  };

  // Drafts are private: only someone holding the management token can see them
  const hasManagementAccess = (doc: any, req: express.Request): boolean => {
    const t = (req.headers['x-management-token'] as string) || (req.query.mt as string);
    return Boolean(t && doc.managementToken === t);
  };
  const isDraftHidden = (doc: any, req: express.Request): boolean =>
    doc.status === 'draft' && !hasManagementAccess(doc, req);

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), features: { devices: true } });
  });

  // 1.1 Device & Server Network Info (helps desktop PCs with monitors & other devices connect)
  app.get('/api/server-info', (req, res) => {
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const detectedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
    const cloudAppUrl = process.env.APP_URL || '';
    const sharedAppUrl = 'https://maketransfer.web.app';
    const devAppUrl = 'https://ais-dev-3r3kxd6lszhpwv7vix3zbg-378094415737.asia-southeast1.run.app';

    // Best public origin to access this app from any other computer/monitor
    const publicUrl = cloudAppUrl || (detectedOrigin.includes('localhost') ? sharedAppUrl : (detectedOrigin || sharedAppUrl));

    res.json({
      status: 'ok',
      publicUrl,
      cloudAppUrl: cloudAppUrl || devAppUrl,
      sharedAppUrl,
      detectedOrigin,
      isCloudRun: Boolean(process.env.K_SERVICE || process.env.APP_URL),
      guidance: {
        troubleshooting: "If seeing 'This site can't be reached' on a desktop CPU with monitor & ethernet:",
        points: [
          "Do NOT use 'localhost:3000' on your desktop PC - localhost only points to that PC itself.",
          "Do NOT add ':3000' to the Cloud Run URL - Cloud Run uses standard HTTPS (port 443).",
          "Ensure your desktop browser uses https:// in the address bar.",
          "Use the Public Cloud App URL which works anywhere on Ethernet or Wi-Fi."
        ]
      }
    });
  });

  // 2. Upload single file
  app.post('/api/upload', (req, res, next) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Failed to process file upload' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file provided in request' });
      }

      try {
        const customSlug = req.body?.customSlug ? String(req.body.customSlug).trim() : undefined;
        if (customSlug && !storage.isSlugAvailable(customSlug)) {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
          }
          return res.status(409).json({ error: `The custom link "${customSlug}" is already in use. Please choose another.` });
        }

        const clientId = getRequestClientId(req);
        const doc = storage.createDocument(req.file, { customSlug, ownerClientId: clientId });

        return res.status(201).json({
          success: true,
          document: storage.sanitizeForPublic(doc),
          managementToken: doc.managementToken,
          slug: doc.slug,
        });
      } catch (uploadError: any) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        console.error('Error creating document:', uploadError);
        const isConflict = uploadError.message?.includes('already in use');
        return res.status(isConflict ? 409 : 500).json({ error: uploadError.message || 'Internal server error processing document' });
      }
    });
  });

  // 2.05 Upload multiple files as distinct individual documents
  app.post('/api/upload-multiple-separate', (req, res) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    upload.array('files', MAX_BUNDLE_FILES)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Failed to process files upload' });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided for multi upload.' });
      }

      try {
        const clientId = getRequestClientId(req);
        const items = files.map((file) => {
          const doc = storage.createDocument(file, { ownerClientId: clientId });
          return {
            success: true,
            document: storage.sanitizeForPublic(doc),
            managementToken: doc.managementToken,
            slug: doc.slug,
          };
        });

        return res.status(201).json({
          success: true,
          count: items.length,
          items,
        });
      } catch (uploadError: any) {
        console.error('Error creating multiple individual documents:', uploadError);
        return res.status(500).json({ error: 'Internal server error processing documents' });
      }
    });
  });

  // 2.1. Upload folder or multi-file bundle
  app.post('/api/upload-bundle', (req, res) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    upload.array('files', MAX_BUNDLE_FILES)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Failed to process bundle upload' });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided for bundle upload.' });
      }

      try {
        let filePaths: string[] = [];
        if (req.body?.paths) {
          try {
            filePaths = typeof req.body.paths === 'string' ? JSON.parse(req.body.paths) : req.body.paths;
          } catch {
            filePaths = files.map((f) => f.originalname);
          }
        } else {
          filePaths = files.map((f) => f.originalname);
        }

        const folderName = req.body?.folderName ? String(req.body.folderName).trim() : undefined;
        const customSlug = req.body?.customSlug ? String(req.body.customSlug).trim() : undefined;
        if (customSlug && !storage.isSlugAvailable(customSlug)) {
          for (const f of files) {
            if (f.path && fs.existsSync(f.path)) {
              try { fs.unlinkSync(f.path); } catch (e) {}
            }
          }
          return res.status(409).json({ error: `The custom link "${customSlug}" is already in use. Please choose another.` });
        }

        const clientId = getRequestClientId(req);

        const doc = storage.createFolderBundle(files, filePaths, { folderName, customSlug, ownerClientId: clientId });

        return res.status(201).json({
          success: true,
          document: storage.sanitizeForPublic(doc),
          managementToken: doc.managementToken,
          slug: doc.slug,
        });
      } catch (uploadError: any) {
        for (const f of files) {
          if (f.path && fs.existsSync(f.path)) {
            try { fs.unlinkSync(f.path); } catch (e) {}
          }
        }
        console.error('Error creating bundle:', uploadError);
        const isConflict = uploadError.message?.includes('already in use');
        return res.status(isConflict ? 409 : 500).json({ error: uploadError.message || 'Internal server error processing bundle' });
      }
    });
  });

  // 2.2. Folder Upload Session Init
  app.post('/api/upload-session/init', (req, res) => {
    try {
      const folderName = req.body?.folderName ? String(req.body.folderName).trim() : undefined;
      const customSlug = req.body?.customSlug ? String(req.body.customSlug).trim() : undefined;
      if (customSlug && !storage.isSlugAvailable(customSlug)) {
        return res.status(409).json({ error: `The custom link "${customSlug}" is already in use. Please choose another.` });
      }
      const clientId = getRequestClientId(req);

      const session = storage.createUploadSession({ folderName, customSlug, ownerClientId: clientId });
      return res.status(200).json({ success: true, ...session });
    } catch (err: any) {
      console.error('Error initializing upload session:', err);
      const isConflict = err.message?.includes('already in use');
      return res.status(isConflict ? 409 : 500).json({ error: err.message || 'Failed to initialize folder upload session' });
    }
  });

  // 2.3. Upload individual item to folder session
  app.post('/api/upload-session/:sessionId/item', (req, res) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);

    const { sessionId } = req.params;
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: `Item upload error: ${err.message}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided in item upload' });
      }

      const itemPath = req.body?.path ? String(req.body.path) : req.file.originalname;
      const result = storage.addSessionItem(sessionId, req.file, itemPath);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to add item to session' });
      }

      return res.status(200).json({ success: true, item: result.item });
    });
  });

  // 2.4. Finalize folder session into document bundle
  app.post('/api/upload-session/:sessionId/finalize', (req, res) => {
    const { sessionId } = req.params;
    const result = storage.finalizeUploadSession(sessionId);

    if (result.error || !result.doc) {
      const isConflict = result.error?.includes('already in use');
      return res.status(isConflict ? 409 : 400).json({ error: result.error || 'Failed to finalize folder bundle' });
    }

    return res.status(201).json({
      success: true,
      document: storage.sanitizeForPublic(result.doc),
      managementToken: result.doc.managementToken,
      slug: result.doc.slug,
    });
  });

  // 2.45 Cancel and clean up an upload session
  app.post('/api/upload-session/:sessionId/cancel', (req, res) => {
    const { sessionId } = req.params;
    const success = storage.cancelUploadSession(sessionId);
    return res.json({ success });
  });

  app.delete('/api/upload-session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const success = storage.cancelUploadSession(sessionId);
    return res.json({ success });
  });

  // 2.5. Chunked Upload - Init
  app.post('/api/upload-chunk/init', (req, res) => {
    let { filename, mimeType, totalChunks } = req.body;
    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      filename = `upload_${Date.now()}.${mimeType ? mimeType.split('/')[1] || 'bin' : 'bin'}`;
    }
    if (!totalChunks || isNaN(Number(totalChunks)) || Number(totalChunks) < 1) {
      return res.status(400).json({ error: 'Valid totalChunks is required' });
    }

    const clientId = getRequestClientId(req);
    const { uploadId } = storage.initChunkUpload(filename.trim(), mimeType || 'application/octet-stream', Number(totalChunks), clientId);
    return res.status(200).json({ success: true, uploadId });
  });

  // 2.6. Chunked Upload - Part
  app.post('/api/upload-chunk/part', (req, res) => {
    upload.single('chunk')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No chunk file received' });

      const uploadId = req.body?.uploadId;
      const chunkIndex = Number(req.body?.chunkIndex);

      if (!uploadId || isNaN(chunkIndex)) {
        return res.status(400).json({ error: 'uploadId and chunkIndex are required' });
      }

      const chunkBuffer = fs.readFileSync(req.file.path);
      // Remove temporary upload file
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}

      const result = storage.saveChunkPart(uploadId, chunkIndex, chunkBuffer);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to save chunk part' });
      }

      return res.status(200).json({ success: true, chunkIndex });
    });
  });

  // 2.65 Cancel and clean up chunk upload
  app.post('/api/upload-chunk/:uploadId/cancel', (req, res) => {
    const { uploadId } = req.params;
    const success = storage.cancelChunkUpload(uploadId);
    return res.json({ success });
  });

  // 2.7. Chunked Upload - Complete (Single File)
  app.post('/api/upload-chunk/complete', (req, res) => {
    const { uploadId, customSlug } = req.body;
    if (!uploadId) return res.status(400).json({ error: 'uploadId is required' });

    const clientId = getRequestClientId(req);
    const result = storage.completeChunkUpload(uploadId, customSlug, clientId);
    if (result.error || !result.doc) {
      const isConflict = result.error?.includes('already in use');
      return res.status(isConflict ? 409 : 400).json({ error: result.error || 'Failed to assemble file chunks' });
    }

    return res.status(201).json({
      success: true,
      document: storage.sanitizeForPublic(result.doc),
      managementToken: result.doc.managementToken,
      slug: result.doc.slug,
    });
  });

  // 2.8. Chunked Upload - Complete for Folder Session
  app.post('/api/upload-chunk/complete-session', (req, res) => {
    const { uploadId, sessionId, itemPath } = req.body;
    if (!uploadId || !sessionId || !itemPath) {
      return res.status(400).json({ error: 'uploadId, sessionId, and itemPath are required' });
    }

    const result = storage.completeChunkForSession(uploadId, sessionId, itemPath);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to add chunked file to folder session' });
    }

    return res.status(200).json({ success: true, item: result.item });
  });

  // 3.1 Batch publish multiple documents
  app.post('/api/documents/publish-batch', async (req, res) => {
    const items: Array<{ slug: string; managementToken: string; options?: any }> = req.body?.items || [];
    const globalOptions = req.body?.globalOptions || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for batch publishing' });
    }

    const publishedResults = [];

    for (const item of items) {
      if (!item.slug || !item.managementToken) continue;
      const cleanSlug = item.slug.trim().replace(/^\/+|\/+$/g, '');
      const opts = { ...globalOptions, ...(item.options || {}) };
      const result = await storage.publishDocument(cleanSlug, item.managementToken, {
        password: opts.password,
        expiresIn: opts.expiresIn,
        maxDownloads: opts.maxDownloads ? Number(opts.maxDownloads) : null,
        description: opts.description,
        customSlug: opts.customSlug,
      });

      if (result.doc) {
        publishedResults.push({
          success: true,
          slug: result.doc.slug,
          document: storage.sanitizeForPublic(result.doc),
          managementToken: result.doc.managementToken,
        });
      }
    }

    return res.json({
      success: true,
      count: publishedResults.length,
      items: publishedResults,
    });
  });

  // 3.2 Batch delete documents (every deletion is authorised by token or owner client id)
  app.post('/api/documents/delete-batch', async (req, res) => {
    const items: Array<{ slug: string; managementToken?: string }> = Array.isArray(req.body?.items) ? req.body.items : [];
    const clientId = getRequestClientId(req);
    const deleteAll = Boolean(req.body?.all);
    const deleted: string[] = [];
    const failed: Array<{ slug: string; error: string }> = [];

    await storage.waitForInit();

    // Delete everything owned by this browser/client id
    if (deleteAll && clientId) {
      for (const owned of storage.getDocumentsByOwner(clientId)) {
        const r = await storage.forceDeleteDocument(owned.slug);
        if (r.success) deleted.push(owned.slug);
        else failed.push({ slug: owned.slug, error: r.error || 'Delete failed' });
      }
    }

    // Delete the specifically requested items
    for (const item of items) {
      if (!item?.slug) continue;
      const cleanSlug = item.slug.trim().replace(/^\/+|\/+$/g, '');
      if (!cleanSlug || deleted.includes(cleanSlug)) continue;
      const r = await storage.deleteDocument(cleanSlug, item.managementToken, clientId);
      if (r.success || r.error === 'Document not found') deleted.push(cleanSlug);
      else failed.push({ slug: cleanSlug, error: r.error || 'Delete failed' });
    }

    return res.json({ success: failed.length === 0, deletedCount: deleted.length, deleted, failed });
  });

  // 3. Publish document (supports nested slugs with '/')
  app.post(/^\/api\/documents\/(.+)\/publish$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const token = (req.headers['x-management-token'] as string) || req.body?.managementToken;

    if (!token) {
      return res.status(401).json({ error: 'Missing management token' });
    }

    const { password, expiresIn, maxDownloads, description, customSlug } = req.body || {};

    const result = await storage.publishDocument(slug, token, {
      password,
      expiresIn,
      maxDownloads: maxDownloads ? Number(maxDownloads) : null,
      description,
      customSlug,
    });

    if (result.error || !result.doc) {
      return res.status(400).json({ error: result.error || 'Failed to publish document' });
    }

    return res.json({
      success: true,
      document: storage.sanitizeForPublic(result.doc),
      managementToken: result.doc.managementToken,
    });
  });

  // 4. Verify password (supports nested slugs with '/')
  app.post(/^\/api\/documents\/(.+)\/verify-password$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const { password } = req.body || {};
    const doc = await storage.getBySlugAsync(slug);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.hasPassword) {
      return res.json({ success: true, token: generateAccessToken(slug) });
    }

    if (!password || !storage.verifyPassword(doc, String(password))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = generateAccessToken(slug);
    return res.json({
      success: true,
      token,
      document: storage.sanitizeForPublic(doc),
    });
  });

  // 5. Management info (supports nested slugs with '/')
  app.get(/^\/api\/documents\/(.+)\/manage$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const token = req.headers['x-management-token'] as string;
    const doc = await storage.getBySlugAsync(slug);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (doc.managementToken !== token) {
      return res.status(401).json({ error: 'Unauthorized: invalid management token' });
    }

    return res.json({
      document: {
        ...storage.sanitizeForPublic(doc),
        managementToken: doc.managementToken,
      },
    });
  });

  // 6. Get public metadata (supports nested slugs with '/')
  app.get(/^\/api\/documents\/(.+)$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const doc = await storage.getBySlugAsync(slug);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found or link has expired' });
    }

    if (doc.status === 'unpublished') {
      return res.status(404).json({ error: 'This document has been unpublished by its owner.' });
    }

    if (isDraftHidden(doc, req)) {
      return res.status(404).json({ error: 'This document has not been published yet.' });
    }

    const isExpired = storage.checkIsExpired(doc);
    if (isExpired) {
      return res.status(410).json({
        error: 'This link has expired.',
        isExpired: true,
        document: storage.sanitizeForPublic(doc),
      });
    }

    // Only count view if not previewing in management or skipping
    if (req.query.skipView !== 'true') {
      storage.incrementView(doc.slug);
    }

    const sanitized = storage.sanitizeForPublic(doc);
    const hasAccess = checkAccess(doc, req);

    return res.json({
      document: sanitized,
      requiresPassword: doc.hasPassword && !hasAccess,
      unlocked: hasAccess,
    });
  });

  // 7. Update settings / unpublish (supports nested slugs with '/')
  app.patch(/^\/api\/documents\/(.+)$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const token = req.headers['x-management-token'] as string;
    const updates = req.body || {};

    const result = await storage.updateDocument(slug, token, updates);
    if (result.error || !result.doc) {
      const isAuth = result.error?.includes('Unauthorized');
      return res.status(isAuth ? 401 : 400).json({ error: result.error || 'Update failed' });
    }

    return res.json({
      success: true,
      document: storage.sanitizeForPublic(result.doc),
    });
  });

  // 8. Delete document (supports nested slugs with '/')
  app.delete(/^\/api\/documents\/(.+)$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const token = req.headers['x-management-token'] as string;
    const clientId = getRequestClientId(req);

    const result = await storage.deleteDocument(slug, token, clientId);
    if (!result.success) {
      const isAuth = result.error?.includes('Unauthorized');
      const isNotFound = result.error === 'Document not found';
      return res.status(isAuth ? 401 : (isNotFound ? 404 : 400)).json({ error: result.error || 'Deletion failed' });
    }

    return res.json({ success: true });
  });

  // 9. Serve raw file inline (supports folder sub-files via ?path= or ?index=)
  app.get(/^\/api\/files\/(.+)\/raw$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const doc = await storage.getBySlugAsync(slug);

    if (!doc) {
      return res.status(404).send('Document not found');
    }

    if (doc.status === 'unpublished') {
      return res.status(404).send('Document is unpublished');
    }

    if (isDraftHidden(doc, req)) {
      return res.status(404).send('Document has not been published yet');
    }

    if (storage.checkIsExpired(doc)) {
      return res.status(410).send('Document link has expired');
    }

    if (doc.hasPassword && !checkAccess(doc, req)) {
      return res.status(401).send('Password required to view document');
    }

    // Folder sub-file resolution
    if (doc.isFolder && doc.items) {
      const itemQuery = (req.query.path as string) || (req.query.index as string) || (req.query.file as string) || '0';
      const item = storage.findFolderItem(doc, itemQuery);

      if (!item) {
        return res.status(404).send('Item not found in folder');
      }

      await storage.ensureFileOnDisk(doc, item);

      const itemPath = storage.getFolderItemFilePath(item);
      if (!fs.existsSync(itemPath)) {
        return res.status(404).send('Item file missing on disk');
      }

      res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.name)}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const stream = fs.createReadStream(itemPath);
      return stream.pipe(res);
    }

    // Single document
    await storage.ensureFileOnDisk(doc);
    const filePath = storage.getFilePath(doc);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File missing on disk');
    }

    // Set correct headers for in-browser rendering
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalFilename)}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  // 10. Download file (supports full zip for folders or single item if ?path= is passed)
  app.get(/^\/api\/files\/(.+)\/download$/, async (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    const doc = await storage.getBySlugAsync(slug);

    if (!doc) {
      return res.status(404).send('Document not found');
    }

    if (doc.status === 'unpublished') {
      return res.status(404).send('Document is unpublished');
    }

    if (isDraftHidden(doc, req)) {
      return res.status(404).send('Document has not been published yet');
    }

    if (storage.checkIsExpired(doc)) {
      return res.status(410).send('Document link has expired');
    }

    if (storage.checkIsDownloadLimitReached(doc)) {
      return res.status(410).send('Download limit reached for this file');
    }

    if (doc.hasPassword && !checkAccess(doc, req)) {
      return res.status(401).send('Password required to download document');
    }

    // Increment download count
    storage.incrementDownload(doc.slug);

    // If folder item download requested
    if (doc.isFolder && doc.items) {
      const itemQuery = (req.query.path as string) || (req.query.file as string) || (req.query.index as string);
      if (itemQuery) {
        const item = storage.findFolderItem(doc, itemQuery);
        if (!item) {
          return res.status(404).send('Item not found in folder');
        }
        await storage.ensureFileOnDisk(doc, item);
        const itemPath = storage.getFolderItemFilePath(item);
        if (!fs.existsSync(itemPath)) {
          return res.status(404).send('Item file missing on disk');
        }
        res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.name)}"`);
        res.setHeader('Content-Length', item.size);
        const stream = fs.createReadStream(itemPath);
        return stream.pipe(res);
      }

      // Stream entire folder as ZIP
      try {
        await storage.ensureAllFolderItemsOnDisk(doc);
        const zipFilename = `${doc.folderName || doc.originalFilename || 'collection'}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);

        const archive = createZipArchive({
          zlib: { level: 6 },
        });

        archive.on('error', (err: any) => {
          console.error('Archiver error:', err);
          if (!res.headersSent) {
            res.status(500).send('Error generating archive');
          }
        });

        archive.pipe(res);

        for (const item of doc.items) {
          const itemPath = storage.getFolderItemFilePath(item);
          if (fs.existsSync(itemPath)) {
            // Normalize entry path inside the zip archive
            const entryName = item.path.replace(/^\/+/, '');
            archive.file(itemPath, { name: entryName });
          }
        }

        await archive.finalize();
      } catch (err) {
        console.error('ZIP generation error:', err);
        if (!res.headersSent) {
          res.status(500).send('Error creating ZIP archive');
        }
      }
      return;
    }

    // Single file download
    try {
      await storage.ensureFileOnDisk(doc);
      const filePath = storage.getFilePath(doc);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File missing on disk');
      }

      res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`);
      res.setHeader('Content-Length', doc.size);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error streaming download');
      }
    }
  });

  // 11. Batch fetch user's documents
  app.post('/api/my-documents', async (req, res) => {
    const items: Array<{ slug: string; managementToken?: string }> = req.body?.items || [];
    const clientId = getRequestClientId(req);
    const resultsMap = new Map<string, any>();
    const missing: string[] = [];

    // Set cookie if clientId exists to preserve session
    if (clientId) {
      res.cookie('maketransfer_client_id', clientId, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax',
      });
      res.cookie('docshare_client_id', clientId, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax',
      });
    }

    // 1. Check explicitly supplied items from client storage
    for (const item of items) {
      if (!item.slug) continue;
      const cleanSlug = item.slug.trim().replace(/^\/+|\/+$/g, '');
      const doc = await storage.getBySlugAsync(cleanSlug);
      if (doc) {
        if (doc.managementToken === item.managementToken || (clientId && doc.ownerClientId === clientId)) {
          const sanitized = storage.sanitizeForPublic(doc);
          sanitized.managementToken = doc.managementToken;
          resultsMap.set(doc.slug, sanitized);
        } else {
          missing.push(cleanSlug);
        }
      } else {
        missing.push(cleanSlug);
      }
    }

    // 2. Also recover any documents owned by this clientId
    if (clientId) {
      const ownedDocs = storage.getDocumentsByOwner(clientId);
      for (const doc of ownedDocs) {
        if (!resultsMap.has(doc.slug)) {
          const sanitized = storage.sanitizeForPublic(doc);
          sanitized.managementToken = doc.managementToken;
          resultsMap.set(doc.slug, sanitized);
        }
      }
    }

    const documents = Array.from(resultsMap.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );

    return res.json({ documents, missing: missing.filter((m) => !resultsMap.has(m)) });
  });

  // 12. Check custom slug availability (supports nested slugs with '/')
  app.get(/^\/api\/check-slug\/(.+)$/, (req, res) => {
    const rawSlug = req.params[0];
    const slug = decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
    if (!isValidSlug(slug)) {
      return res.json({ available: false, error: 'Invalid slug format' });
    }
    return res.json({ available: storage.isSlugAvailable(slug) });
  });

  // Device IDs, inbox and direct-transfer signalling
  registerDeviceRoutes(app);

  // API 404 handler for missing /api endpoints
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
  });

  // Global API error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(err.status || err.statusCode || 500).json({
      error: err.message || 'Internal server error occurred while processing request',
    });
  });

  // Vite middleware for dev / static for production
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (typeof process.argv[1] === 'string' && process.argv[1].includes('dist'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MakeTransfer Server running on http://localhost:${PORT}`);

    // Keep-alive: Render's free plan sleeps after ~15 minutes without traffic.
    // Ping our own public URL every 14 minutes so the service stays awake.
    const keepAliveUrl = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
    if (keepAliveUrl) {
      const KEEP_ALIVE_MS = 14 * 60 * 1000;
      const timer = setInterval(() => {
        fetch(`${keepAliveUrl}/api/health`)
          .then((r) => console.log(`[keep-alive] ping ${keepAliveUrl}/api/health -> ${r.status}`))
          .catch((e) => console.warn('[keep-alive] ping failed:', e?.message || e));
      }, KEEP_ALIVE_MS);
      (timer as any).unref?.();
      console.log(`[keep-alive] pinging ${keepAliveUrl}/api/health every 14 minutes`);
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
