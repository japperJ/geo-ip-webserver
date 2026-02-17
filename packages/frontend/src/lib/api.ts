import axios from 'axios';

// In-memory token storage (not localStorage for security)
let currentAuthToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  currentAuthToken = token;
};

export const getAuthToken = () => currentAuthToken;

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to all requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// GeoJSON type definitions
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // Array of linear rings
}

export interface Site {
  id: string;
  slug: string;
  name: string;
  hostname: string | null;
  access_mode: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist: string[] | null;
  ip_denylist: string[] | null;
  country_allowlist: string[] | null;
  country_denylist: string[] | null;
  block_vpn_proxy: boolean;
  geofence_type: 'polygon' | 'radius' | null;
  geofence_polygon: GeoJSONPolygon | null;
  geofence_center: GeoJSONPoint | null;
  geofence_radius_km: number | null;
  enabled: boolean;
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
  hostname?: string;
  access_mode?: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  block_vpn_proxy?: boolean;
  geofence_type?: 'polygon' | 'radius' | null;
  geofence_polygon?: GeoJSONPolygon | null;
  geofence_center?: GeoJSONPoint | null;
  geofence_radius_km?: number | null;
}

export interface UpdateSiteInput {
  name?: string;
  hostname?: string;
  access_mode?: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  block_vpn_proxy?: boolean;
  geofence_type?: 'polygon' | 'radius' | null;
  geofence_polygon?: GeoJSONPolygon | null;
  geofence_center?: GeoJSONPoint | null;
  geofence_radius_km?: number | null;
  enabled?: boolean;
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
