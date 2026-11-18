import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, saveUserDocToCloud, getUserDocsFromCloud, testConnection } from '../lib/firebase';
import { getMyUploads, saveMyUpload } from '../lib/api';

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => void;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_STORAGE_KEY = 'maketransfer_is_guest_mode';
const LEGACY_GUEST_STORAGE_KEY = 'docshare_is_guest_mode';

function getInitialGuestState(): boolean {
  try {
    const val = localStorage.getItem(GUEST_STORAGE_KEY) || localStorage.getItem(LEGACY_GUEST_STORAGE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

function persistGuestState(isGuest: boolean) {
  try {
    const val = isGuest ? 'true' : 'false';
    localStorage.setItem(GUEST_STORAGE_KEY, val);
    localStorage.setItem(LEGACY_GUEST_STORAGE_KEY, val);
  } catch {}
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(getInitialGuestState);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        setIsGuest(false);
        persistGuestState(false);

        // Sync local guest uploads to Firestore under this user account
        try {
          const localUploads = getMyUploads();
          const cloudDocs = await getUserDocsFromCloud(currentUser.uid);
          const cloudSlugs = new Set(cloudDocs.map((d) => d.slug));

          // Upload any local records missing from cloud
          for (const item of localUploads) {
            if (!cloudSlugs.has(item.slug)) {
              await saveUserDocToCloud(currentUser.uid, {
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
              } as any);
            }
          }

          // Pull cloud documents into the local cache, but never overwrite what this browser already has
          const localSlugs = new Set(getMyUploads().map((x) => x.slug));
          for (const cloudDoc of cloudDocs) {
            if (!cloudDoc.slug || localSlugs.has(cloudDoc.slug)) continue;
            saveMyUpload(
              {
                slug: cloudDoc.slug,
                managementToken: cloudDoc.managementToken || '',
                originalFilename: cloudDoc.originalFilename || cloudDoc.originalName || 'Document',
                size: cloudDoc.size ?? cloudDoc.fileSize ?? 0,
                uploadedAt: cloudDoc.uploadedAt,
                isFolder: Boolean(cloudDoc.isFolder),
                totalFiles: cloudDoc.totalFiles || 1,
                status: (cloudDoc.status as any) || 'unknown',
              },
              { skipCloud: true }
            );
          }
        } catch (e) {
          console.warn('Sync with cloud failed:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setIsGuest(false);
      persistGuestState(false);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      throw err;
    }
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    persistGuestState(true);
  };

  const signOutUser = async () => {
    await signOut(auth);
    setUser(null);
    setIsGuest(true);
    persistGuestState(true);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        loading,
        signInWithGoogle,
        continueAsGuest,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
