import { useMutation, useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { siteApi, Site, CreateSiteInput, UpdateSiteInput, ListSitesResponse } from './api';

// Query keys
export const siteKeys = {
  all: ['sites'] as const,
  lists: () => [...siteKeys.all, 'list'] as const,
  list: (filters: { page?: number; limit?: number }) => [...siteKeys.lists(), filters] as const,
  details: () => [...siteKeys.all, 'detail'] as const,
  detail: (id: string) => [...siteKeys.details(), id] as const,
};

// Queries
export function useSites(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: siteKeys.list(params || {}),
    queryFn: () => siteApi.list(params),
  });
}

export function useSite(
  id: string | undefined,
  options?: Omit<UseQueryOptions<Site>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: siteKeys.detail(id!),
    queryFn: () => siteApi.getById(id!),
    enabled: Boolean(id),
    ...options,
  });
}

// Mutations
export function useCreateSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSiteInput) => siteApi.create(input),
    onMutate: async (newSite) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: siteKeys.lists() });

      // Snapshot previous value
      const previousSites = queryClient.getQueryData<ListSitesResponse>(
        siteKeys.list({ page: 1, limit: 10 })
      );

      // Optimistically update (if we have the list cached)
      if (previousSites) {
        queryClient.setQueryData<ListSitesResponse>(
          siteKeys.list({ page: 1, limit: 10 }),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              sites: [
                {
                  id: 'temp-id',
                  ...newSite,
                  ip_allowlist: newSite.ip_allowlist || [],
                  ip_denylist: newSite.ip_denylist || [],
                  country_allowlist: newSite.country_allowlist || [],
                  country_denylist: newSite.country_denylist || [],
                  vpn_detection_enabled: newSite.vpn_detection_enabled || false,
                  is_active: newSite.is_active ?? true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                ...old.sites,
              ],
              pagination: {
                ...old.pagination,
                total: old.pagination.total + 1,
              },
            };
          }
        );
      }

      return { previousSites };
    },
    onError: (_err, _newSite, context) => {
      // Rollback on error
      if (context?.previousSites) {
        queryClient.setQueryData(
          siteKeys.list({ page: 1, limit: 10 }),
          context.previousSites
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: siteKeys.lists() });
    },
  });
}

export function useUpdateSite(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSiteInput) => siteApi.update(id, input),
    onMutate: async (updatedFields) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: siteKeys.detail(id) });

      // Snapshot previous value
      const previousSite = queryClient.getQueryData<Site>(siteKeys.detail(id));

      // Optimistically update
      if (previousSite) {
        queryClient.setQueryData<Site>(siteKeys.detail(id), {
          ...previousSite,
          ...updatedFields,
          updated_at: new Date().toISOString(),
        });
      }

      return { previousSite };
    },
    onError: (_err, _updatedFields, context) => {
      // Rollback on error
      if (context?.previousSite) {
        queryClient.setQueryData(siteKeys.detail(id), context.previousSite);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: siteKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: siteKeys.lists() });
    },
  });
}

export function useDeleteSite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => siteApi.delete(id),
    onMutate: async (deletedId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: siteKeys.lists() });

      // Snapshot previous value
      const previousSites = queryClient.getQueryData<ListSitesResponse>(
        siteKeys.list({ page: 1, limit: 10 })
      );

      // Optimistically remove from list
      if (previousSites) {
        queryClient.setQueryData<ListSitesResponse>(
          siteKeys.list({ page: 1, limit: 10 }),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              sites: old.sites.filter((site) => site.id !== deletedId),
              pagination: {
                ...old.pagination,
                total: old.pagination.total - 1,
              },
            };
          }
        );
      }

      return { previousSites };
    },
    onError: (_err, _deletedId, context) => {
      // Rollback on error
      if (context?.previousSites) {
        queryClient.setQueryData(
          siteKeys.list({ page: 1, limit: 10 }),
          context.previousSites
        );
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: siteKeys.lists() });
    },
  });
}
