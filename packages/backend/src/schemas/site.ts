import { z } from 'zod';

// Access mode enum
const accessModeSchema = z.enum(['disabled', 'ip_only', 'geo_only', 'ip_and_geo']);

// Core site schema
export const siteSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  hostname: z.string().min(3).max(255).regex(/^[a-z0-9.-]+$/, 'Invalid hostname format').nullable(),
  name: z.string().min(1).max(255),
  access_mode: accessModeSchema,
  ip_allowlist: z.array(z.string()).nullable(),
  ip_denylist: z.array(z.string()).nullable(),
  country_allowlist: z.array(z.string().length(2, 'Country code must be 2 characters (ISO 3166-1 alpha-2)')).nullable(),
  country_denylist: z.array(z.string().length(2)).nullable(),
  block_vpn_proxy: z.boolean(),
  enabled: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

// Create site schema (subset of fields)
export const createSiteSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  hostname: z.string().min(3).max(255).regex(/^[a-z0-9.-]+$/).optional(),
  name: z.string().min(1).max(255),
  access_mode: accessModeSchema.default('disabled'),
  ip_allowlist: z.array(z.string()).optional(),
  ip_denylist: z.array(z.string()).optional(),
  country_allowlist: z.array(z.string().length(2)).optional(),
  country_denylist: z.array(z.string().length(2)).optional(),
  block_vpn_proxy: z.boolean().default(false),
});

// Update site schema (all fields optional)
export const updateSiteSchema = z.object({
  hostname: z.string().min(3).max(255).regex(/^[a-z0-9.-]+$/).optional(),
  name: z.string().min(1).max(255).optional(),
  access_mode: accessModeSchema.optional(),
  ip_allowlist: z.array(z.string()).optional(),
  ip_denylist: z.array(z.string()).optional(),
  country_allowlist: z.array(z.string().length(2)).optional(),
  country_denylist: z.array(z.string().length(2)).optional(),
  block_vpn_proxy: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

// List sites query schema
export const listSitesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  access_mode: accessModeSchema.optional(),
});

// Site ID param schema
export const siteIdParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

// List response schema
export const listSitesResponseSchema = z.object({
  sites: z.array(siteSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

// Export TypeScript types
export type Site = z.infer<typeof siteSchema>;
export type CreateSite = z.infer<typeof createSiteSchema>;
export type UpdateSite = z.infer<typeof updateSiteSchema>;
export type ListSitesQuery = z.infer<typeof listSitesQuerySchema>;
export type ListSitesResponse = z.infer<typeof listSitesResponseSchema>;
