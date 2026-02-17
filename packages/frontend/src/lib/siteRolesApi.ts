import { api } from './api';

export type SiteRole = 'admin' | 'viewer';

export interface SiteRoleRecord {
  user_id: string;
  site_id: string;
  role: SiteRole;
  granted_by: string | null;
  granted_at: string;
  user: {
    id: string;
    email: string;
    global_role: 'super_admin' | 'user';
  };
}

interface ListSiteRolesResponse {
  success: boolean;
  roles: SiteRoleRecord[];
}

interface UpsertSiteRoleResponse {
  success: boolean;
  siteRole: SiteRoleRecord;
}

export async function listSiteRoles(siteId: string): Promise<SiteRoleRecord[]> {
  const { data } = await api.get<ListSiteRolesResponse>(`/sites/${siteId}/roles`);
  return data.roles;
}

export async function upsertSiteRole(
  siteId: string,
  userId: string,
  role: SiteRole,
): Promise<SiteRoleRecord> {
  const { data } = await api.post<UpsertSiteRoleResponse>(`/sites/${siteId}/roles`, {
    userId,
    role,
  });

  return data.siteRole;
}

export async function revokeSiteRole(siteId: string, userId: string): Promise<void> {
  await api.delete(`/sites/${siteId}/roles/${userId}`);
}

export const siteRolesApi = {
  list: listSiteRoles,
  upsert: upsertSiteRole,
  revoke: revokeSiteRole,
};
