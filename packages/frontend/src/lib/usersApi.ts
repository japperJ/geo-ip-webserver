import { api } from './api';

export type GlobalRole = 'super_admin' | 'user';

export interface UserListItem {
  id: string;
  email: string;
  global_role: GlobalRole;
}

interface ListUsersResponse {
  success: boolean;
  users: UserListItem[];
}

interface UpdateUserResponse {
  success: boolean;
  user: UserListItem;
}

export async function listUsers(q?: string): Promise<UserListItem[]> {
  const { data } = await api.get<ListUsersResponse>('/users', {
    params: { q },
  });

  return data.users;
}

export async function updateUserGlobalRole(
  id: string,
  global_role: GlobalRole,
): Promise<UserListItem> {
  const { data } = await api.patch<UpdateUserResponse>(`/users/${id}`, { global_role });
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export const usersApi = {
  list: listUsers,
  updateRole: updateUserGlobalRole,
  delete: deleteUser,
};
