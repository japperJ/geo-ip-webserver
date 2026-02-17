import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { siteApi } from '@/lib/api';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function SitesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [page, setPage] = useState(1);
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['sites', page, limit],
    queryFn: () => siteApi.list({ page, limit }),
  });

  const deleteMutation = useMutation({
    mutationFn: (siteId: string) => siteApi.delete(siteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });

  const handleDelete = async (siteId: string, siteName: string) => {
    const confirmed = window.confirm(
      `Delete site "${siteName}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingSiteId(siteId);
      await deleteMutation.mutateAsync(siteId);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Failed to delete site';
      alert(apiMessage);
    } finally {
      setDeletingSiteId(null);
    }
  };

  const getAccessModeBadge = (mode: string) => {
    switch (mode) {
      case 'open':
        return <Badge variant="success">Open</Badge>;
      case 'ip_only':
        return <Badge variant="default">IP Only</Badge>;
      case 'vpn_blocked':
        return <Badge variant="destructive">VPN Blocked</Badge>;
      default:
        return <Badge variant="secondary">{mode}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Sites</h1>
          <p className="mt-2 text-gray-400">
            Manage your geo-fenced sites and access control rules.
          </p>
        </div>
        <Button onClick={() => navigate('/sites/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Site
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sites</CardTitle>
          <CardDescription>
            A list of all sites configured in the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-500">Error loading sites: {error.message}</p>
            </div>
          )}

          {data && data.sites.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>No sites found.</p>
              <Button className="mt-4" variant="outline" onClick={() => navigate('/sites/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first site
              </Button>
            </div>
          )}

          {data && data.sites.length > 0 && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Access Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium text-white">
                        {site.name}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {site.slug}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {site.hostname}
                      </TableCell>
                      <TableCell>
                        {getAccessModeBadge(site.access_mode)}
                      </TableCell>
                      <TableCell>
                        {site.enabled ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigate(`/sites/${site.id}/content`)}
                          >
                            Content
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => navigate(`/sites/${site.id}/edit`)}
                          >
                            Edit
                          </Button>
                          {isSuperAdmin && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(site.id, site.name)}
                              disabled={deletingSiteId === site.id}
                            >
                              {deletingSiteId === site.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">
                    Page {data.pagination.page} of {data.pagination.totalPages} (
                    {data.pagination.total} total sites)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page >= data.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
