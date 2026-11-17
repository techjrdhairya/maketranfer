import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
} from 'firebase/firestore';

interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

let dbInstance: any = null;
let isInitialized = false;
let quotaExhaustedUntil: number = 0;

export function isQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil;
}

export function getFirestoreDB() {
  if (dbInstance) return dbInstance;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.warn('firebase-applet-config.json not found on server');
      return null;
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config: FirebaseConfig = JSON.parse(raw);

    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    dbInstance = getFirestore(app, config.firestoreDatabaseId);
    isInitialized = true;
    console.log('Server Firebase Firestore initialized successfully.');
    return dbInstance;
  } catch (err) {
    console.error('Failed to initialize server Firestore:', err);
    return null;
  }
}

export function encodeSlugForDocId(slug: string): string {
  return encodeURIComponent(slug.trim().replace(/^\/+|\/+$/g, '')).replace(/\./g, '%2E');
}

export function removeUndefinedFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = removeUndefinedFields(value);
    }
  }
  return clean;
}

// 800KB chunk size to maximize data per write (safe below 1MB Firestore limit)
const CHUNK_SIZE = 800 * 1024;
const MAX_CHUNKABLE_SIZE = 50 * 1024 * 1024; // Up to 50MB

const inFlightPersists = new Set<string>();

async function uploadBufferChunksInBatches(
  chunksColRef: any,
  buffer: Buffer,
  concurrency: number = 3
): Promise<{ totalChunks: number; fileSize: number }> {
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
  const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

  for (let i = 0; i < chunkIndices.length; i += concurrency) {
    const batch = chunkIndices.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (idx) => {
        const start = idx * CHUNK_SIZE;
        const chunkBuffer = buffer.subarray(start, start + CHUNK_SIZE);
        const chunkDocRef = doc(chunksColRef, `chunk_${idx}`);
        await setDoc(chunkDocRef, { index: idx, data: chunkBuffer.toString('base64') });
      })
    );
  }
  return { totalChunks, fileSize: buffer.length };
}

async function restoreBufferFromChunks(chunksColRef: any, expectedCount?: number): Promise<Buffer | null> {
  const chunksSnap = await getDocs(chunksColRef);
  if (chunksSnap.empty) return null;

  const chunkDocs: { index: number; data: string }[] = [];
  chunksSnap.forEach((c) => {
    const cd = c.data() as any;
    if (cd && typeof cd.index === 'number' && typeof cd.data === 'string') {
      chunkDocs.push({ index: cd.index, data: cd.data });
    }
  });

  if (expectedCount && chunkDocs.length < expectedCount) {
    console.warn(`Restoring chunks: expected ${expectedCount}, found ${chunkDocs.length}`);
  }

  chunkDocs.sort((a, b) => a.index - b.index);
  const bufferList = chunkDocs.map((c) => Buffer.from(c.data, 'base64'));
  return Buffer.concat(bufferList);
}

export async function persistDocumentToFirestore(docData: any, uploadsDir: string) {
  if (isQuotaExhausted()) {
    return;
  }

  try {
    const db = getFirestoreDB();
    if (!db || !docData || !docData.slug) return;
    if (isQuotaExhausted()) return;

    const docId = encodeSlugForDocId(docData.slug);
    if (inFlightPersists.has(docId)) {
      return;
    }
    inFlightPersists.add(docId);

    try {
      const firestoreRef = doc(db, 'publicDocuments', docId);

      // Prepare metadata payload
      const payload: any = {
        ...docData,
        syncedAt: new Date().toISOString(),
      };

      if (!docData.isFolder && docData.storedFilename) {
        const filePath = path.join(uploadsDir, docData.storedFilename);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const rawBuffer = fs.readFileSync(filePath);

          // Attempt gzip compression to fit under single document 1MB limit
          let compressed: Buffer | null = null;
          try {
            compressed = zlib.gzipSync(rawBuffer, { level: 6 });
          } catch {}

          const useCompressed = compressed && compressed.length < rawBuffer.length;
          const bestBuffer = useCompressed ? compressed! : rawBuffer;

          // If best buffer fits comfortably within a single Firestore document (<= 700KB)
          if (bestBuffer.length <= 700 * 1024) {
            payload.fileBase64 = bestBuffer.toString('base64');
            payload.isGzipped = useCompressed;
            payload.hasChunks = false;
          } else if (stats.size <= MAX_CHUNKABLE_SIZE) {
            // Larger files use chunking with 800KB chunks to minimize writes
            try {
              const chunksCol = collection(db, 'publicDocuments', docId, 'chunks');
              const { totalChunks, fileSize } = await uploadBufferChunksInBatches(chunksCol, rawBuffer, 2);
              payload.hasChunks = true;
              payload.chunkCount = totalChunks;
              payload.fileSize = fileSize;
              payload.isGzipped = false;
              delete payload.fileBase64;
            } catch (e: any) {
              if (e?.code === 'resource-exhausted' || e?.message?.includes('RESOURCE_EXHAUSTED')) {
                quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
                console.warn('Firestore write quota exceeded; pausing cloud sync for 15 minutes.');
                return;
              }
            }
          }
        }
      } else if (docData.isFolder && Array.isArray(docData.items)) {
        let totalDirectBase64Bytes = 0;
        const backedItems: any[] = [];

        for (const item of docData.items) {
          const itemCopy = { ...item };
          const itemPath = path.join(uploadsDir, item.storedFilename);
          if (fs.existsSync(itemPath)) {
            const rawBuffer = fs.readFileSync(itemPath);
            let compressed: Buffer | null = null;
            try {
              compressed = zlib.gzipSync(rawBuffer, { level: 6 });
            } catch {}

            const useCompressed = compressed && compressed.length < rawBuffer.length;
            const bestBuffer = useCompressed ? compressed! : rawBuffer;

            if (bestBuffer.length <= 700 * 1024 && totalDirectBase64Bytes + bestBuffer.length < 700 * 1024) {
              totalDirectBase64Bytes += bestBuffer.length;
              itemCopy.fileBase64 = bestBuffer.toString('base64');
              itemCopy.isGzipped = useCompressed;
              itemCopy.hasChunks = false;
            } else if (item.size <= MAX_CHUNKABLE_SIZE) {
              try {
                const itemChunksCol = collection(db, 'publicDocuments', docId, 'items', item.id || `item_${item.index || 0}`, 'chunks');
                const { totalChunks, fileSize } = await uploadBufferChunksInBatches(itemChunksCol, rawBuffer, 2);
                itemCopy.hasChunks = true;
                itemCopy.chunkCount = totalChunks;
                itemCopy.fileSize = fileSize;
                delete itemCopy.fileBase64;
              } catch (e: any) {
                if (e?.code === 'resource-exhausted' || e?.message?.includes('RESOURCE_EXHAUSTED')) {
                  quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
                  console.warn('Firestore write quota exceeded during folder item persist.');
                  return;
                }
              }
            }
          }
          backedItems.push(itemCopy);
        }
        payload.items = backedItems;
      }

      const cleanPayload = removeUndefinedFields(payload);
      await setDoc(firestoreRef, cleanPayload, { merge: true });
      console.log(`Document ${docData.slug} successfully persisted to Cloud Firestore.`);
    } finally {
      inFlightPersists.delete(docId);
    }
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
      console.warn('Firestore write quota exceeded; pausing cloud sync for 15 minutes.');
    } else {
      console.error(`Failed to persist document ${docData?.slug} to Firestore:`, err?.message || err);
    }
  }
}

export async function restoreFileFromFirestore(docId: string, data: any, uploadsDir: string): Promise<boolean> {
  const db = getFirestoreDB();
  if (!db || !data || !data.storedFilename) return false;

  const targetPath = path.join(uploadsDir, data.storedFilename);
  if (fs.existsSync(targetPath)) return true;

  try {
    let base64 = data.fileBase64;
    let isGzipped = Boolean(data.isGzipped);
    let hasChunks = data.hasChunks;
    let chunkCount = data.chunkCount;

    // If base64 or chunks info is not present in memory, load document data from Firestore
    if (!base64 && !hasChunks) {
      const docSnap = await getDoc(doc(db, 'publicDocuments', docId));
      if (docSnap.exists()) {
        const firestoreData = docSnap.data();
        base64 = firestoreData?.fileBase64;
        isGzipped = Boolean(firestoreData?.isGzipped);
        hasChunks = firestoreData?.hasChunks;
        chunkCount = firestoreData?.chunkCount;
      }
    }

    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      if (isGzipped) {
        try {
          const decompressed = zlib.gunzipSync(buffer);
          fs.writeFileSync(targetPath, decompressed);
          console.log(`Restored and decompressed gzip file ${data.storedFilename} to disk.`);
          return true;
        } catch {
          fs.writeFileSync(targetPath, buffer);
          return true;
        }
      } else {
        fs.writeFileSync(targetPath, buffer);
        console.log(`Restored base64 file ${data.storedFilename} (${buffer.length} bytes) to disk.`);
        return true;
      }
    } else if (hasChunks && chunkCount) {
      const chunksCol = collection(db, 'publicDocuments', docId, 'chunks');
      const fullBuffer = await restoreBufferFromChunks(chunksCol, chunkCount);
      if (fullBuffer) {
        fs.writeFileSync(targetPath, fullBuffer);
        console.log(`Restored chunked file ${data.storedFilename} (${(fullBuffer.length / 1024 / 1024).toFixed(2)} MB) to disk.`);
        return true;
      }
    }
  } catch (err) {
    console.error(`Error restoring file ${data.storedFilename} from Firestore:`, err);
  }
  return false;
}

export async function restoreFolderItemFromFirestore(
  docId: string,
  item: any,
  uploadsDir: string
): Promise<boolean> {
  const db = getFirestoreDB();
  if (!db || !item || !item.storedFilename) return false;

  const targetPath = path.join(uploadsDir, item.storedFilename);
  if (fs.existsSync(targetPath)) return true;

  try {
    let base64 = item.fileBase64;
    let isGzipped = Boolean(item.isGzipped);
    let hasChunks = item.hasChunks;
    let chunkCount = item.chunkCount;

    if (!base64 && !hasChunks) {
      const docSnap = await getDoc(doc(db, 'publicDocuments', docId));
      if (docSnap.exists()) {
        const firestoreData = docSnap.data();
        if (Array.isArray(firestoreData?.items)) {
          const matched = firestoreData.items.find((it: any) =>
            it.storedFilename === item.storedFilename || it.id === item.id || it.path === item.path
          );
          if (matched) {
            base64 = matched.fileBase64;
            isGzipped = Boolean(matched.isGzipped);
            hasChunks = matched.hasChunks;
            chunkCount = matched.chunkCount;
          }
        }
      }
    }

    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      if (isGzipped) {
        try {
          const decompressed = zlib.gunzipSync(buffer);
          fs.writeFileSync(targetPath, decompressed);
          return true;
        } catch {
          fs.writeFileSync(targetPath, buffer);
          return true;
        }
      } else {
        fs.writeFileSync(targetPath, buffer);
        return true;
      }
    } else if (hasChunks && chunkCount) {
      const itemChunksCol = collection(db, 'publicDocuments', docId, 'items', item.id || `item_${item.index || 0}`, 'chunks');
      const fullBuffer = await restoreBufferFromChunks(itemChunksCol, chunkCount);
      if (fullBuffer) {
        fs.writeFileSync(targetPath, fullBuffer);
        return true;
      }
    }
  } catch (err) {
    console.error(`Error restoring folder item ${item.storedFilename} from Firestore:`, err);
  }
  return false;
}

export async function fetchDocumentFromFirestore(slug: string, uploadsDir: string): Promise<any | null> {
  try {
    const db = getFirestoreDB();
    if (!db || !slug) return null;

    const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, '');
    const docId = encodeSlugForDocId(cleanSlug);
    const docRef = doc(db, 'publicDocuments', docId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    if (!data || !data.slug) return null;

    // Restore single file if missing locally
    if (data.storedFilename) {
      await restoreFileFromFirestore(docId, data, uploadsDir);
    }

    // Restore folder sub-files if missing locally
    if (data.isFolder && Array.isArray(data.items)) {
      for (const item of data.items) {
        await restoreFolderItemFromFirestore(docId, item, uploadsDir);
      }
    }

    // Remove the base64 payload from returned object to keep memory slim
    const cleanDoc = { ...data };
    delete cleanDoc.fileBase64;
    if (Array.isArray(cleanDoc.items)) {
      cleanDoc.items = cleanDoc.items.map((it: any) => {
        const itemClean = { ...it };
        delete itemClean.fileBase64;
        return itemClean;
      });
    }

    return cleanDoc;
  } catch (err) {
    console.error(`Failed to fetch document ${slug} from Firestore:`, err);
    return null;
  }
}

export async function deleteDocumentFromFirestore(slug: string, isFolder?: boolean) {
  try {
    const db = getFirestoreDB();
    if (!db || !slug) return;
    const docId = encodeSlugForDocId(slug);

    const deleteOperation = async () => {
      await deleteDoc(doc(db, 'publicDocuments', docId));

      // Attempt deleting any chunks subcollection documents
      try {
        const chunksCol = collection(db, 'publicDocuments', docId, 'chunks');
        const chunksSnap = await getDocs(chunksCol);
        if (!chunksSnap.empty) {
          await Promise.allSettled(chunksSnap.docs.map((c) => deleteDoc(c.ref)));
        }
      } catch (e) {}

      // Only check for folder items if doc was a folder
      if (isFolder) {
        try {
          const itemsCol = collection(db, 'publicDocuments', docId, 'items');
          const itemsSnap = await getDocs(itemsCol);
          for (const itemDoc of itemsSnap.docs) {
            try {
              const itemChunksCol = collection(itemDoc.ref, 'chunks');
              const itemChunksSnap = await getDocs(itemChunksCol);
              if (!itemChunksSnap.empty) {
                await Promise.allSettled(itemChunksSnap.docs.map((c) => deleteDoc(c.ref)));
              }
            } catch {}
            await deleteDoc(itemDoc.ref).catch(() => {});
          }
        } catch (e) {}
      }
      console.log(`Document ${slug} deleted from Cloud Firestore.`);
    };

    // Run with 3 second timeout so slow network never hangs
    await Promise.race([
      deleteOperation(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch (err) {
    console.error(`Failed to delete document ${slug} from Firestore:`, err);
  }
}

export async function loadDocumentsFromFirestore(uploadsDir: string): Promise<any[]> {
  try {
    const db = getFirestoreDB();
    if (!db) return [];

    const colRef = collection(db, 'publicDocuments');
    const snap = await getDocs(colRef);
    const results: any[] = [];

    for (const d of snap.docs) {
      const data = d.data();
      if (!data || !data.slug) continue;

      if (data.storedFilename) {
        await restoreFileFromFirestore(d.id, data, uploadsDir);
      }

      // Restore folder sub-files if local files do not exist
      if (data.isFolder && Array.isArray(data.items)) {
        for (const item of data.items) {
          await restoreFolderItemFromFirestore(d.id, item, uploadsDir);
        }
      }

      // Remove the base64 payload from memory object to keep memory slim
      const cleanDoc = { ...data };
      delete cleanDoc.fileBase64;
      if (Array.isArray(cleanDoc.items)) {
        cleanDoc.items = cleanDoc.items.map((it: any) => {
          const itemClean = { ...it };
          delete itemClean.fileBase64;
          return itemClean;
        });
      }

      results.push(cleanDoc);
    }

    console.log(`Successfully synced ${results.length} documents from Cloud Firestore.`);
    return results;
  } catch (err) {
    console.error('Failed to load documents from Firestore:', err);
    return [];
  }
}
