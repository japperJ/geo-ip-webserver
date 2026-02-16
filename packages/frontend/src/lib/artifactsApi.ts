import { api } from './api';

interface ArtifactPresignResponse {
  url: string;
}

export const artifactsApi = {
  getPresignedUrl: async (key: string): Promise<string> => {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const { data } = await api.get<ArtifactPresignResponse>(`/artifacts/${encodedKey}`);
    return data.url;
  },
};

export function extractS3Key(url: string): string | null {
  if (!url.startsWith('s3://')) {
    return null;
  }

  const withoutScheme = url.slice('s3://'.length);
  const firstSlashIndex = withoutScheme.indexOf('/');

  if (firstSlashIndex === -1) {
    return null;
  }

  return withoutScheme.slice(firstSlashIndex + 1);
}
