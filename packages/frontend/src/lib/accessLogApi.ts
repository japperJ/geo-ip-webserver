import { api } from './api';

// Access Log types
export interface AccessLog {
  id: string;
  site_id: string;
  timestamp: string;
  ip_address: string;
  user_agent: string | null;
  url: string;
  allowed: boolean;
  reason: string;
  ip_country: string | null;
  ip_city: string | null;
  ip_lat: number | null;
  ip_lng: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy: number | null;
  screenshot_url: string | null;
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
