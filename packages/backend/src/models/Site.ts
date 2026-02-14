export interface Site {
  id: string;
  slug: string;
  hostname: string | null;
  name: string;
  access_mode: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist: string[] | null;
  ip_denylist: string[] | null;
  country_allowlist: string[] | null;
  country_denylist: string[] | null;
  block_vpn_proxy: boolean;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSiteInput {
  slug: string;
  hostname?: string;
  name: string;
  access_mode?: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  block_vpn_proxy?: boolean;
}

export interface UpdateSiteInput {
  hostname?: string;
  name?: string;
  access_mode?: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
  ip_allowlist?: string[];
  ip_denylist?: string[];
  country_allowlist?: string[];
  country_denylist?: string[];
  block_vpn_proxy?: boolean;
  enabled?: boolean;
}

export interface ListSitesQuery {
  page?: number;
  limit?: number;
  access_mode?: 'disabled' | 'ip_only' | 'geo_only' | 'ip_and_geo';
}
