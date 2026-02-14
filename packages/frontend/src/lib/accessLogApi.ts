import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Access Log types
export interface AccessLog {
  id: string;
  site_id: string;
  timestamp: string;
  ip_address: string;
  user_agent: string;
  path: string;
  allowed: boolean;
  reason: string;
  country_code: string | null;
  city: string | null;
  vpn_detected: boolean;
}

export interface ListAccessLogsResponse {
  logs: AccessLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListAccessLogsParams {
  site_id?: string;
  allowed?: boolean;
  start_date?: string;
  end_date?: string;
  ip?: string;
  page?: number;
  limit?: number;
}

// Access Log API functions
export const accessLogApi = {
  list: async (params?: ListAccessLogsParams): Promise<ListAccessLogsResponse> => {
    const { data } = await api.get<ListAccessLogsResponse>('/access-logs', { params });
    return data;
  },

  getById: async (id: string): Promise<AccessLog> => {
    const { data } = await api.get<AccessLog>(`/access-logs/${id}`);
    return data;
  },
};
