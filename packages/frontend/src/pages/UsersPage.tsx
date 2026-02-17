import { useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert, Trash2 } from 'lucide-react';
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
import { usersApi, type GlobalRole, type UserListItem } from '@/lib/usersApi';

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
}

export function UsersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const isSuperAdmin = user?.role === 'super_admin';
  const queryTerm = useMemo(() => search.trim(), [search]);

  const usersQuery = useQuery({
    queryKey: ['users', queryTerm],
    queryFn: () => usersApi.list(queryTerm || undefined),
    enabled: isSuperAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: GlobalRole }) => usersApi.updateRole(id, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const handleRoleChange = (target: UserListItem, role: GlobalRole) => {
    if (target.global_role === role) {
      return;
    }

    updateRoleMutation.mutate({ id: target.id, role });
  };

  const handleDelete = (target: UserListItem) => {
    const confirmed = window.confirm(`Delete user ${target.email}? This will deactivate the account.`);
    if (!confirmed) {
      return;
    }

    deleteUserMutation.mutate(target.id);
  };

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4 text-white">
        <h1 className="text-3xl font-bold">Users</h1>
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-4">
          <p className="text-red-300">Only super admins can access user management.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/sites')}>
          Back to Sites
        </Button>
      </div>
    );
  }

  const updateError = getApiErrorMessage(updateRoleMutation.error, 'Failed to update user role.');
  const deleteError = getApiErrorMessage(deleteUserMutation.error, 'Failed to delete user.');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Users</h1>
        <p className="mt-2 text-gray-400">Manage global user roles and account access.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>Search users by email and adjust global permissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search users by email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {usersQuery.isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
            </div>
          )}

          {usersQuery.error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-red-300">
              {getApiErrorMessage(usersQuery.error, 'Failed to load users.')}
            </div>
          )}

          {!usersQuery.isLoading && !usersQuery.error && usersQuery.data?.length === 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-6 text-center text-gray-300">
              <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              No users found for this query.
            </div>
          )}

          {!usersQuery.isLoading && !usersQuery.error && (usersQuery.data?.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Global role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data?.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-white">{entry.email}</TableCell>
                    <TableCell>
                      <Select
                        value={entry.global_role}
                        onValueChange={(value) => handleRoleChange(entry, value as GlobalRole)}
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="super_admin">super_admin</SelectItem>
                          <SelectItem value="user">user</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(entry)}
                          disabled={deleteUserMutation.isPending}
                        >
                          {deleteUserMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {updateRoleMutation.isError && <p className="text-sm text-red-400">{updateError}</p>}
          {deleteUserMutation.isError && <p className="text-sm text-red-400">{deleteError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
