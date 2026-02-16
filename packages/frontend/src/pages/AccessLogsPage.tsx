import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { accessLogApi } from '@/lib/accessLogApi';
import type { AccessLog } from '@/lib/accessLogApi';
import { artifactsApi, extractS3Key } from '@/lib/artifactsApi';
import { siteApi } from '@/lib/api';
import { Loader2, Filter, Eye } from 'lucide-react';

export function AccessLogsPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [filters, setFilters] = useState<{
    site_id?: string;
    allowed?: boolean;
    ip?: string;
    start_date?: string;
    end_date?: string;
  }>({});

  const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);
  const screenshotKey = selectedLog?.screenshot_url
    ? extractS3Key(selectedLog.screenshot_url)
    : null;

  const { data: sitesData } = useQuery({
    queryKey: ['sites', 1, 100],
    queryFn: () => siteApi.list({ page: 1, limit: 100 }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['accessLogs', page, limit, filters],
    queryFn: () => accessLogApi.list({ page, limit, ...filters }),
  });

  const {
    data: screenshotUrl,
    isLoading: isScreenshotLoading,
    error: screenshotError,
  } = useQuery({
    queryKey: ['artifact-presigned-url', screenshotKey],
    queryFn: () => artifactsApi.getPresignedUrl(screenshotKey!),
    enabled: Boolean(screenshotKey),
  });

  const handleFilterChange = (key: string, value: string | boolean | undefined) => {
    setFilters((prev) => {
      if (value === undefined || value === '' || value === 'all') {
        const newFilters = { ...prev };
        delete newFilters[key as keyof typeof prev];
        return newFilters;
      }
      return { ...prev, [key]: value };
    });
    setPage(1);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Access Logs</h1>
        <p className="mt-2 text-gray-400">
          View access control decisions and request logs.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site_filter">Site</Label>
              <Select
                value={filters.site_id || 'all'}
                onValueChange={(value) => handleFilterChange('site_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sitesData?.sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowed_filter">Status</Label>
              <Select
                value={
                  filters.allowed === undefined
                    ? 'all'
                    : filters.allowed
                    ? 'allowed'
                    : 'blocked'
                }
                onValueChange={(value) =>
                  handleFilterChange(
                    'allowed',
                    value === 'all' ? undefined : value === 'allowed'
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ip_filter">IP Address</Label>
              <Input
                id="ip_filter"
                placeholder="192.168.1.0"
                value={filters.ip || ''}
                onChange={(e) => handleFilterChange('ip', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_filter">Start Date</Label>
              <Input
                id="date_filter"
                type="date"
                value={filters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Access Logs</CardTitle>
          <CardDescription>
            {data ? `Showing ${data.logs.length} of ${data.pagination.total} logs` : 'Loading...'}
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
              <p className="text-red-500">Error loading logs: {error.message}</p>
            </div>
          )}

          {data && data.logs.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>No access logs found.</p>
            </div>
          )}

          {data && data.logs.length > 0 && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-gray-400 text-sm">
                        {formatTimestamp(log.timestamp)}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-gray-300">
                        {log.ip_address}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm max-w-xs truncate">
                        {log.url}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {log.ip_country ? (
                          <span className="font-mono">{log.ip_country}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.allowed ? (
                          <Badge variant="success">Allowed</Badge>
                        ) : (
                          <Badge variant="destructive">Blocked</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm max-w-xs truncate">
                        {log.reason}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
                    {data.pagination.total} total logs)
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

      {/* Log Detail Modal - MVP-020 */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>Access Log Details</CardTitle>
              <CardDescription>ID: {selectedLog.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Timestamp</Label>
                  <p className="text-white">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div>
                  <Label>IP Address</Label>
                  <p className="text-white font-mono">{selectedLog.ip_address}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">
                    {selectedLog.allowed ? (
                      <Badge variant="success">Allowed</Badge>
                    ) : (
                      <Badge variant="destructive">Blocked</Badge>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Country</Label>
                  <p className="text-white">{selectedLog.ip_country || '—'}</p>
                </div>
                <div className="col-span-2">
                  <Label>Path</Label>
                  <p className="text-white break-all">{selectedLog.url}</p>
                </div>
                <div className="col-span-2">
                  <Label>Reason</Label>
                  <p className="text-white">{selectedLog.reason}</p>
                </div>
                <div className="col-span-2">
                  <Label>User Agent</Label>
                  <p className="text-white text-sm break-all">{selectedLog.user_agent || '—'}</p>
                </div>
                {selectedLog.screenshot_url && (
                  <div className="col-span-2 space-y-2">
                    <Label>Screenshot</Label>
                    {isScreenshotLoading && (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading screenshot...
                      </div>
                    )}

                    {!isScreenshotLoading && screenshotError && (
                      <p className="text-red-400 text-sm">Failed to load screenshot preview.</p>
                    )}

                    {!isScreenshotLoading && !screenshotError && !screenshotUrl && (
                      <p className="text-gray-400 text-sm">Screenshot is not available.</p>
                    )}

                    {!isScreenshotLoading && screenshotUrl && (
                      <a
                        href={screenshotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block"
                      >
                        <img
                          src={screenshotUrl}
                          alt="Blocked request screenshot"
                          className="max-h-64 rounded border border-gray-700 object-contain"
                        />
                        <span className="mt-2 inline-block text-sm text-blue-400 hover:underline">
                          Open full screenshot
                        </span>
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setSelectedLog(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
