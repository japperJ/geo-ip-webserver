import { useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteSiteContent,
  getSiteContentDownloadUrl,
  listSiteContent,
  uploadSiteContent,
  type SiteContentItem,
} from '@/lib/contentApi';
import { siteApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { 
  Loader2, 
  Upload, 
  Download, 
  Trash2, 
  File, 
  FileText, 
  FileImage,
  FileVideo,
  FileArchive,
  ArrowLeft,
} from 'lucide-react';

type SiteRole = 'admin' | 'viewer' | undefined;

interface JwtPayload {
  role?: 'super_admin' | 'user';
  sites?: Record<string, SiteRole>;
}

function parseJwtPayload(token: string | null): JwtPayload {
  if (!token) {
    return {};
  }

  try {
    const [, payload = ''] = token.split('.');
    if (!payload) {
      return {};
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return {};
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const unit = 1024;
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), units.length - 1);
  const value = bytes / Math.pow(unit, index);

  return `${Math.round(value * 100) / 100} ${units[index]}`;
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return '—';
  }

  return new Date(timestamp).toLocaleString();
}

function getFileIcon(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
    return <FileImage className="h-5 w-5 text-blue-400" />;
  }

  if (['mp4', 'webm', 'avi', 'mov'].includes(extension)) {
    return <FileVideo className="h-5 w-5 text-purple-400" />;
  }

  if (['zip', 'tar', 'gz', 'rar'].includes(extension)) {
    return <FileArchive className="h-5 w-5 text-yellow-400" />;
  }

  if (['txt', 'md', 'json', 'html', 'css', 'js', 'ts', 'tsx'].includes(extension)) {
    return <FileText className="h-5 w-5 text-green-400" />;
  }

  return <File className="h-5 w-5 text-gray-400" />;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
}

export function SiteContentPage() {
  const { id: siteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!siteId) {
    return (
      <div className="space-y-3 text-white">
        <p>No site selected.</p>
        <Link to="/sites" className="text-blue-400 hover:underline">
          Go to Sites
        </Link>
      </div>
    );
  }

  const jwtPayload = parseJwtPayload(token);
  const siteRole = jwtPayload.sites?.[siteId];
  const isSuperAdmin = jwtPayload.role === 'super_admin';
  const canManageContent = isSuperAdmin || siteRole === 'admin';
  const canViewContent = canManageContent || siteRole === 'viewer';

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => siteApi.getById(siteId),
    enabled: canViewContent,
  });

  const contentQuery = useQuery({
    queryKey: ['site-content', siteId],
    queryFn: () => listSiteContent(siteId),
    enabled: canViewContent,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadSiteContent(siteId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-content', siteId] });
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteSiteContent(siteId, key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-content', siteId] });
    },
  });

  const handleUpload = () => {
    if (!selectedFile) {
      return;
    }

    uploadMutation.mutate(selectedFile);
  };

  const handleDownload = async (item: SiteContentItem) => {
    try {
      const { url } = await getSiteContentDownloadUrl(siteId, item.key);
      window.location.assign(url);
    } catch (error) {
      window.alert(getApiErrorMessage(error, 'Download failed.'));
    }
  };

  const handleDelete = (item: SiteContentItem) => {
    const confirmed = window.confirm(`Delete "${item.filename}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(item.key);
  };

  if (!canViewContent) {
    return (
      <div className="space-y-4 text-white">
        <h1 className="text-2xl font-semibold">Content Management</h1>
        <p className="text-red-400">You do not have access to this site's content.</p>
        <Button variant="outline" onClick={() => navigate('/sites')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sites
        </Button>
      </div>
    );
  }

  const isLoading = siteQuery.isLoading || contentQuery.isLoading;
  const uploadErrorMessage = getApiErrorMessage(uploadMutation.error, 'Upload failed.');
  const deleteErrorMessage = getApiErrorMessage(deleteMutation.error, 'Delete failed.');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/sites')}
            className="mb-2 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Sites
          </Button>
          <h1 className="text-3xl font-bold text-white">Content Management</h1>
          <p className="mt-2 text-gray-400">
            {siteQuery.data ? (
              <>
                Manage content for <span className="text-white font-medium">{siteQuery.data.name}</span>
              </>
            ) : (
              'Manage content for this site.'
            )}
          </p>
        </div>

        <Badge variant="outline" className={canManageContent ? 'text-blue-400 border-blue-400' : ''}>
          {canManageContent ? 'Admin controls enabled' : 'Viewer mode'}
        </Badge>
      </div>

      {canManageContent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Content
            </CardTitle>
            <CardDescription>
              Upload files for protected serving through site content endpoints.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  disabled={uploadMutation.isPending}
                />
                {selectedFile && (
                  <p className="mt-2 text-sm text-gray-400">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>

            {uploadMutation.isError && (
              <p className="text-sm text-red-400">{uploadErrorMessage}</p>
            )}

            {uploadMutation.isSuccess && (
              <p className="text-sm text-green-400">File uploaded successfully.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            {contentQuery.data?.items.length
              ? `${contentQuery.data.items.length} file${contentQuery.data.items.length === 1 ? '' : 's'}`
              : 'No files uploaded yet'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}

          {contentQuery.error && (
            <div className="py-8 text-center">
              <p className="text-red-400">{getApiErrorMessage(contentQuery.error, 'Failed to load content.')}</p>
            </div>
          )}

          {!isLoading && !contentQuery.error && contentQuery.data?.items.length === 0 && (
            <div className="py-8 text-center text-gray-400">
              <File className="mx-auto mb-3 h-12 w-12 text-gray-600" />
              <p>No files uploaded yet.</p>
            </div>
          )}

          {!isLoading && !contentQuery.error && (contentQuery.data?.items.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>Filename</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contentQuery.data?.items.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell>{getFileIcon(item.filename)}</TableCell>
                    <TableCell className="font-medium text-white">{item.filename}</TableCell>
                    <TableCell className="text-gray-400">{formatFileSize(item.size)}</TableCell>
                    <TableCell className="text-gray-400">{formatTimestamp(item.lastModified)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleDownload(item)}>
                          <Download className="mr-1 h-4 w-4" />
                          Download
                        </Button>

                        {canManageContent && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(item)}
                            disabled={deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {deleteMutation.isError && (
            <p className="mt-3 text-sm text-red-400">{deleteErrorMessage}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}