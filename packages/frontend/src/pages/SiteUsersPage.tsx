import { useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/lib/auth';
import { siteRolesApi, type SiteRole } from '@/lib/siteRolesApi';
import { usersApi } from '@/lib/usersApi';

type SiteAccessRole = SiteRole | undefined;

interface JwtPayload {
  role?: 'super_admin' | 'user';
  sites?: Record<string, SiteAccessRole>;
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

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof AxiosError) {
    return error.response?.status;
  }

  return undefined;
}

export function SiteUsersPage() {
  const { id: siteId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<SiteRole>('viewer');
  const [userSearch, setUserSearch] = useState('');

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
  const isSuperAdmin = jwtPayload.role === 'super_admin';
  const siteRole = jwtPayload.sites?.[siteId];
  const hasSiteAccess = isSuperAdmin || Boolean(siteRole);

  const rolesQuery = useQuery({
    queryKey: ['site-users', siteId],
    queryFn: () => siteRolesApi.list(siteId),
    enabled: Boolean(siteId),
  });

  const userSearchTerm = useMemo(() => userSearch.trim(), [userSearch]);
  const userSearchQuery = useQuery({
    queryKey: ['users', 'picker', userSearchTerm],
    queryFn: () => usersApi.list(userSearchTerm || undefined),
    enabled: isSuperAdmin,
  });

  const grantRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: SiteRole }) =>
      siteRolesApi.upsert(siteId, userId, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-users', siteId] });
      setSelectedUserId('');
    },
  });

  const revokeRoleMutation = useMutation({
    mutationFn: (userId: string) => siteRolesApi.revoke(siteId, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-users', siteId] });
    },
  });

  const rolesForbidden = getErrorStatus(rolesQuery.error) === 403;

  const handleGrantOrUpdate = () => {
    if (!selectedUserId) {
      return;
    }

    grantRoleMutation.mutate({ userId: selectedUserId, role: selectedRole });
  };

  const handleRevoke = (userId: string, email: string) => {
    const confirmed = window.confirm(`Revoke site access for ${email}?`);
    if (!confirmed) {
      return;
    }

    revokeRoleMutation.mutate(userId);
  };

  if (rolesForbidden || !hasSiteAccess) {
    return (
      <div className="space-y-4 text-white">
        <h1 className="text-3xl font-bold">Site Users</h1>
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-4">
          <p className="text-red-300">You do not have access to this site’s user delegation page.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/sites')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sites
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <h1 className="text-3xl font-bold text-white">Site Users</h1>
        <p className="mt-2 text-gray-400">
          View delegated roles for this site. {isSuperAdmin ? 'Grant and revoke access as needed.' : 'You have read-only access.'}
        </p>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Grant or Update Site Role
            </CardTitle>
            <CardDescription>
              Search users and assign <code>admin</code> or <code>viewer</code> access for this site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search users by email"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
            />

            {userSearchQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading users...
              </div>
            )}

            {userSearchQuery.isError && (
              <p className="text-sm text-red-400">
                {getApiErrorMessage(userSearchQuery.error, 'Failed to search users.')}
              </p>
            )}

            {!userSearchQuery.isLoading && !userSearchQuery.isError && (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {(userSearchQuery.data ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-3">
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as SiteRole)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="viewer">viewer</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={handleGrantOrUpdate}
                disabled={!selectedUserId || grantRoleMutation.isPending}
              >
                {grantRoleMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Grant / Update'
                )}
              </Button>
            </div>

            {grantRoleMutation.isError && (
              <p className="text-sm text-red-400">
                {getApiErrorMessage(grantRoleMutation.error, 'Failed to grant role.')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current Site Roles</CardTitle>
          <CardDescription>Users with delegated access to this site.</CardDescription>
        </CardHeader>
        <CardContent>
          {rolesQuery.isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
            </div>
          )}

          {rolesQuery.isError && !rolesForbidden && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-300">
              {getApiErrorMessage(rolesQuery.error, 'Failed to load site roles.')}
            </div>
          )}

          {!rolesQuery.isLoading && !rolesQuery.isError && (rolesQuery.data?.length ?? 0) === 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-6 text-center text-gray-300">
              <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              No delegated users found for this site.
            </div>
          )}

          {!rolesQuery.isLoading && !rolesQuery.isError && (rolesQuery.data?.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Global role</TableHead>
                  <TableHead>Site role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rolesQuery.data?.map((entry) => (
                  <TableRow key={entry.user_id}>
                    <TableCell className="font-medium text-white">{entry.user?.email ?? entry.user_id}</TableCell>
                    <TableCell className="text-gray-300">{entry.user?.global_role ?? 'user'}</TableCell>
                    <TableCell className="text-gray-300">{entry.role}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {isSuperAdmin ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevoke(entry.user_id, entry.user?.email ?? entry.user_id)}
                            disabled={revokeRoleMutation.isPending}
                          >
                            {revokeRoleMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="mr-1 h-4 w-4" />
                                Revoke
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-sm text-gray-500">Read-only</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {revokeRoleMutation.isError && (
            <p className="mt-3 text-sm text-red-400">
              {getApiErrorMessage(revokeRoleMutation.error, 'Failed to revoke role.')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
