import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  getDocFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase is in offline mode or network is unreachable.');
    }
  }
}

// Test connection on boot
testConnection();

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    if (user) {
      // Sync user profile to /users/{uid}
      await setDoc(
        doc(db, 'users', user.uid),
        {
          userId: user.uid, // required by the shared firestore.rules
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          lastLoginAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
    return user;
  } catch (err) {
    console.error('Sign-in error:', err);
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export interface CloudUserDocument {
  id?: string;
  slug: string;
  originalName?: string;
  originalFilename?: string;
  folderName?: string;
  size?: number;
  fileSize?: number;
  mimeType?: string;
  extension?: string;
  uploadedAt: string;
  managementToken?: string;
  hasPassword?: boolean;
  downloadCount?: number;
  viewCount?: number;
  isFolder?: boolean;
  totalFiles?: number;
  previewType?: string;
  status?: string;
  expiresAt?: string;
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

export async function saveUserDocRefToCloud(userId: string, docData: any) {
  try {
    const slug = docData.slug || docData.id;
    const docId = encodeSlugForDocId(slug);
    const payload = removeUndefinedFields({
      ...docData,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'users', userId, 'documents', docId), payload, { merge: true });
  } catch (err) {
    console.error('Failed to save doc to user cloud:', err);
  }
}

export const saveUserDocToCloud = saveUserDocRefToCloud;
export const getUserDocsFromCloud = fetchUserDocsFromCloud;

export async function fetchUserDocsFromCloud(userId: string): Promise<CloudUserDocument[]> {
  try {
    const colRef = collection(db, 'users', userId, 'documents');
    const snap = await getDocs(colRef);
    const docs: CloudUserDocument[] = [];
    snap.forEach((d) => {
      docs.push(d.data() as CloudUserDocument);
    });
    return docs;
  } catch (err) {
    console.error('Failed to fetch user docs from cloud:', err);
    return [];
  }
}

export async function deleteUserDocFromCloud(userId: string, slug: string) {
  try {
    const docId = encodeSlugForDocId(slug);
    await deleteDoc(doc(db, 'users', userId, 'documents', docId));
  } catch (err) {
    console.error('Failed to delete doc from user cloud:', err);
  }
}

// Remove the user's cloud records. With `slugs` only those documents are removed;
// without it every record of the user is removed.
// (Public documents are deleted by the server, never from the browser.)
export async function deleteAllUserDocsFromCloud(userId: string, slugs?: string[]) {
  try {
    let targets: string[] = [];
    if (slugs && slugs.length > 0) {
      targets = Array.from(new Set(slugs.filter(Boolean)));
    } else {
      const snap = await getDocs(collection(db, 'users', userId, 'documents'));
      targets = snap.docs.map((d) => (d.data()?.slug as string) || d.id);
    }

    await Promise.allSettled(
      targets.map(async (s) => {
        const docId = encodeSlugForDocId(s);
        await deleteDoc(doc(db, 'users', userId, 'documents', docId));
        if (docId !== s) {
          await deleteDoc(doc(db, 'users', userId, 'documents', s)).catch(() => {});
        }
      })
    );
  } catch (err) {
    console.error('Failed to delete user docs from cloud:', err);
  }
}

export async function fetchPublicDocFromFirestore(slug: string): Promise<any | null> {
  try {
    const docId = encodeSlugForDocId(slug);
    const snap = await getDoc(doc(db, 'publicDocuments', docId));
    if (snap.exists()) {
      const data = snap.data();
      // Only published, non-expired documents may be shown through this fallback
      if (data.status !== 'published') return null;
      if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) return null;
      const cleanDoc = { ...data };
      delete cleanDoc.fileBase64;
      return cleanDoc;
    }
    return null;
  } catch (err) {
    console.warn('Direct Firestore publicDoc fetch failed:', err);
    return null;
  }
}


