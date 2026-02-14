export interface AccessLog {
  id: string;
  site_id: string;
  timestamp: Date;
  ip_address: string; // Anonymized
  user_agent: string | null;
  url: string;
  allowed: boolean;
  reason: string;
  ip_country: string | null;
  ip_city: string | null;
  ip_lat: number | null;
  ip_lng: number | null;
  gps_lat: number | null; // Phase 2
  gps_lng: number | null; // Phase 2
  gps_accuracy: number | null; // Phase 2
  screenshot_url: string | null; // Phase 4
}

export interface CreateAccessLogInput {
  site_id: string;
  ip_address: string;
  user_agent: string | null;
  url: string;
  allowed: boolean;
  reason: string;
  ip_country?: string;
  ip_city?: string;
  ip_lat?: number;
  ip_lng?: number;
}
