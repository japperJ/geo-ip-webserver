import { s3Service } from './S3Service.js';

export interface UploadContentInput {
  filename: string;
  data: Buffer;
  contentType?: string;
}

export interface SiteContentItem {
  key: string;
  filename: string;
  size: number;
  lastModified: Date | null;
}

interface ContentStorageAdapter {
  uploadFile(key: string, body: Buffer, contentType?: string): Promise<string>;
  deleteFile(key: string): Promise<void>;
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
  listFiles(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date | null }>>;
}

const CONTENT_KEY_PREFIX = 'sites';

export class ContentService {
  constructor(private storage: ContentStorageAdapter = s3Service) {}

  getSitePrefix(siteId: string): string {
    return `${CONTENT_KEY_PREFIX}/${siteId}/content/`;
  }

  buildObjectKey(siteId: string, filename: string): string {
    const safeFilename = this.sanitizeFilename(filename);
    return `${this.getSitePrefix(siteId)}${safeFilename}`;
  }

  validateKeyForSite(siteId: string, key: string): void {
    const expectedPrefix = this.getSitePrefix(siteId);

    if (!key.startsWith(expectedPrefix)) {
      throw new Error('Invalid key for site');
    }
  }

  async listSiteContent(siteId: string): Promise<SiteContentItem[]> {
    const prefix = this.getSitePrefix(siteId);
    const objects = await this.storage.listFiles(prefix);

    return objects
      .filter((item) => item.key.startsWith(prefix))
      .map((item) => ({
        key: item.key,
        filename: item.key.substring(prefix.length),
        size: item.size,
        lastModified: item.lastModified,
      }))
      .filter((item) => item.filename.length > 0)
      .sort((a, b) => a.filename.localeCompare(b.filename));
  }

  async uploadSiteContent(siteId: string, input: UploadContentInput): Promise<{ key: string; filename: string; location: string }> {
    const key = this.buildObjectKey(siteId, input.filename);
    const location = await this.storage.uploadFile(
      key,
      input.data,
      input.contentType || 'application/octet-stream'
    );

    return {
      key,
      filename: this.sanitizeFilename(input.filename),
      location,
    };
  }

  async deleteSiteContent(siteId: string, key: string): Promise<void> {
    this.validateKeyForSite(siteId, key);
    await this.storage.deleteFile(key);
  }

  async getDownloadUrl(siteId: string, key: string, expiresIn: number = 300): Promise<string> {
    this.validateKeyForSite(siteId, key);
    return this.storage.getPresignedUrl(key, expiresIn);
  }

  async getDownloadUrlByFilename(siteId: string, filename: string, expiresIn: number = 300): Promise<string> {
    const key = this.buildObjectKey(siteId, filename);
    return this.storage.getPresignedUrl(key, expiresIn);
  }

  private sanitizeFilename(filename: string): string {
    const normalized = filename.trim().replace(/\\/g, '/');
    const basename = normalized.split('/').pop() || '';

    if (!basename || basename === '.' || basename === '..') {
      throw new Error('Invalid filename');
    }

    if (basename.includes('\0')) {
      throw new Error('Invalid filename');
    }

    return basename;
  }
}

export const contentService = new ContentService();
