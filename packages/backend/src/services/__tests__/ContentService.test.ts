import { describe, expect, it } from 'vitest';
import { ContentService } from '../ContentService.js';

function createStorageMock() {
  const objects = new Map<string, { body: Buffer; contentType?: string; lastModified: Date }>();

  return {
    uploadFile: async (key: string, body: Buffer, contentType?: string) => {
      objects.set(key, { body, contentType, lastModified: new Date() });
      return `s3://site-assets/${key}`;
    },
    deleteFile: async (key: string) => {
      objects.delete(key);
    },
    getPresignedUrl: async (key: string, expiresIn: number = 300) => {
      return `https://minio.local/site-assets/${encodeURIComponent(key)}?X-Amz-Expires=${expiresIn}`;
    },
    listFiles: async (prefix: string) => {
      return Array.from(objects.entries())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({
          key,
          size: value.body.length,
          lastModified: value.lastModified,
        }));
    },
  };
}

describe('ContentService', () => {
  it('returns an empty list when a site has no content', async () => {
    const storage = createStorageMock();
    const service = new ContentService(storage);

    const items = await service.listSiteContent('site-1');

    expect(items).toEqual([]);
  });

  it('uploads content and returns it in list output', async () => {
    const storage = createStorageMock();
    const service = new ContentService(storage);

    const uploaded = await service.uploadSiteContent('site-1', {
      filename: 'guide.pdf',
      data: Buffer.from('pdf-data'),
      contentType: 'application/pdf',
    });

    const items = await service.listSiteContent('site-1');

    expect(uploaded.key).toBe('sites/site-1/content/guide.pdf');
    expect(items).toHaveLength(1);
    expect(items[0].filename).toBe('guide.pdf');
    expect(items[0].size).toBe(8);
  });

  it('deletes uploaded content from list', async () => {
    const storage = createStorageMock();
    const service = new ContentService(storage);

    const uploaded = await service.uploadSiteContent('site-1', {
      filename: 'logo.png',
      data: Buffer.from('image-bytes'),
    });

    await service.deleteSiteContent('site-1', uploaded.key);

    const items = await service.listSiteContent('site-1');
    expect(items).toEqual([]);
  });

  it('returns a presigned download url for site-scoped content', async () => {
    const storage = createStorageMock();
    const service = new ContentService(storage);

    const url = await service.getDownloadUrl('site-1', 'sites/site-1/content/manual.txt', 120);

    expect(url).toContain('https://minio.local/site-assets/');
    expect(url).toContain('X-Amz-Expires=120');
  });

  it('blocks cross-site key usage', async () => {
    const storage = createStorageMock();
    const service = new ContentService(storage);

    await expect(
      service.getDownloadUrl('site-1', 'sites/site-2/content/manual.txt', 120)
    ).rejects.toThrow('Invalid key for site');
  });
});
