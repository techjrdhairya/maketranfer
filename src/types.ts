export type DocumentStatus = 'draft' | 'published' | 'unpublished' | 'expired' | 'missing' | 'unknown';

export interface FolderItemMetadata {
  id: string;
  index: number;
  path: string; // e.g. "components/Header.tsx"
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  previewType: 'pdf' | 'image' | 'text' | 'markdown' | 'docx' | 'spreadsheet' | 'audio' | 'video' | 'binary';
}

export interface DocumentMetadata {
  id: string;
  slug: string;
  originalFilename: string;
  folderName?: string;
  extension: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  publishedAt?: string;
  status: DocumentStatus;
  hasPassword?: boolean;
  expiresAt?: string | null;
  maxDownloads?: number | null;
  viewCount: number;
  downloadCount: number;
  description?: string;
  scanStatus: 'clean' | 'scanning' | 'flagged';
  previewType: 'pdf' | 'image' | 'text' | 'markdown' | 'docx' | 'spreadsheet' | 'audio' | 'video' | 'binary' | 'folder';
  isFolder?: boolean;
  totalFiles?: number;
  items?: FolderItemMetadata[];
  managementToken?: string;
}

export interface DocumentManageDetails extends DocumentMetadata {
  managementToken: string;
}

export interface UploadResponse {
  success: boolean;
  document: DocumentMetadata;
  managementToken: string;
  slug: string;
  shareUrl?: string;
}

export interface MultiUploadResult {
  success: boolean;
  items: UploadResponse[];
}

export interface BatchPublishItem {
  slug: string;
  managementToken: string;
  options?: PublishRequest;
}

export interface BatchPublishRequest {
  items: BatchPublishItem[];
  globalOptions?: PublishRequest;
}

export interface PublishRequest {
  title?: string;
  description?: string;
  password?: string;
  expiresIn?: string; // '1h' | '24h' | '7d' | '30d' | 'never' | custom ISO
  maxDownloads?: number | null;
  customSlug?: string;
}

export interface MyUploadItem {
  slug: string;
  managementToken: string;
  originalFilename: string;
  size: number;
  uploadedAt: string;
  isFolder?: boolean;
  totalFiles?: number;
  status?: DocumentStatus; // last status we saw (used when the server cannot be reached)
}
