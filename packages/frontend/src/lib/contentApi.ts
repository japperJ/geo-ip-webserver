import { api } from './api';

export interface SiteContentItem {
  key: string;
  filename: string;
  size: number;
  lastModified: string | null;
}

export interface ListSiteContentResponse {
  items: SiteContentItem[];
}

export interface UploadSiteContentResponse {
  key: string;
  filename: string;
  location: string;
}

export interface SiteContentDownloadUrlResponse {
  url: string;
}

async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export async function listSiteContent(siteId: string): Promise<ListSiteContentResponse> {
  const { data } = await api.get<ListSiteContentResponse>(`/sites/${siteId}/content`);
  return data;
}

export async function uploadSiteContent(siteId: string, file: File): Promise<UploadSiteContentResponse> {
  const contentBase64 = await fileToBase64(file);
  const { data } = await api.post<UploadSiteContentResponse>(`/sites/${siteId}/content/upload`, {
    filename: file.name,
    contentBase64,
    contentType: file.type || undefined,
  });
  return data;
}

export async function deleteSiteContent(siteId: string, key: string): Promise<void> {
  await api.delete(`/sites/${siteId}/content/${encodeURIComponent(key)}`);
}

export async function getSiteContentDownloadUrl(
  siteId: string,
  key: string,
): Promise<SiteContentDownloadUrlResponse> {
  const { data } = await api.get<SiteContentDownloadUrlResponse>(`/sites/${siteId}/content/download`, {
    params: { key },
  });
  return data;
}

export const contentApi = {
  listSiteContent,
  uploadSiteContent,
  deleteSiteContent,
  getSiteContentDownloadUrl,
};
