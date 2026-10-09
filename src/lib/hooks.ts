import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CollectionMap, type CollectionName } from "@/lib/api";
import type { BillingDocument, BillingSettings } from "@/lib/types";

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get(), staleTime: 60_000 });
export const useDocs = () => useQuery({ queryKey: ["docs"], queryFn: () => api.docs.list() });
export const useDoc = (id: string | undefined) => useQuery({ queryKey: ["docs", id], queryFn: () => api.docs.get(id!), enabled: !!id });
export const usePayments = () => useQuery({ queryKey: ["payments"], queryFn: () => api.payments.list() });
export const useEvents = (documentId?: string) => useQuery({ queryKey: ["events", documentId ?? "all"], queryFn: () => api.events.list(documentId) });
export const useRevisions = (id: string | undefined) => useQuery({ queryKey: ["revisions", id], queryFn: () => api.docs.revisions(id!), enabled: !!id });
export const useJobs = () => useQuery({ queryKey: ["jobs"], queryFn: () => api.tracker.jobs() });
export const useReports = () => useQuery({ queryKey: ["reports"], queryFn: () => api.tracker.reports() });
export const useInfoRequests = () => useQuery({ queryKey: ["info-requests"], queryFn: () => api.tracker.infoRequests() });

export function useCollection<K extends CollectionName>(name: K) {
  return useQuery({ queryKey: ["col", name], queryFn: () => api.col(name).list() as Promise<CollectionMap[K][]> });
}

export function useSaveRow<K extends CollectionName>(name: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: CollectionMap[K] & { id: string }) => api.col(name).upsert(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["col", name] }),
  });
}
export function useRemoveRow<K extends CollectionName>(name: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.col(name).remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["col", name] }),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: BillingSettings) => api.settings.save(s),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });
}

/** Documents keyed by id, for lookups. */
export function indexDocs(docs: BillingDocument[] | undefined): Map<string, BillingDocument> {
  return new Map((docs ?? []).map((d) => [d.id, d]));
}
