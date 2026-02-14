import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Site {
  id: string;
  slug: string;
  name: string;
  hostname: string;
  access_mode: 'open' | 'ip_only' | 'vpn_blocked';
  ip_allowlist: string[];
  ip_denylist: string[];
  country_allowlist: string[];
  country_denylist: string[];
  vpn_detection_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListSitesResponse {
  sites: Site[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateSiteInput {
  slug: string;
  name: string;
  hostname: string;
  access_mode: 'open' | 'ip_only' | 'vpn_blocked';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  vpn_detection_enabled?: boolean;
  is_active?: boolean;
}

export interface UpdateSiteInput {
  name?: string;
  hostname?: string;
  access_mode?: 'open' | 'ip_only' | 'vpn_blocked';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  vpn_detection_enabled?: boolean;
  is_active?: boolean;
}

// Site API functions
export const siteApi = {
  list: async (params?: { page?: number; limit?: number }): Promise<ListSitesResponse> => {
    const { data } = await api.get<ListSitesResponse>('/sites', { params });
    return data;
  },

  getById: async (id: string): Promise<Site> => {
    const { data } = await api.get<Site>(`/sites/${id}`);
    return data;
  },

  create: async (input: CreateSiteInput): Promise<Site> => {
    const { data } = await api.post<Site>('/sites', input);
    return data;
  },

  update: async (id: string, input: UpdateSiteInput): Promise<Site> => {
    const { data } = await api.patch<Site>(`/sites/${id}`, input);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/sites/${id}`);
  },
};
