import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ApiError,
  changeStatus,
  createRequest,
  getHistory,
  getRequest,
  getStats,
  listRequests,
  listUsers,
  updateRequest,
} from "@/lib/api";
import type {
  ChangeStatusInput,
  RequestDto,
  RequestListQuery,
  UpdateRequestInput,
} from "@/lib/types";

export const queryKeys = {
  requests: ["requests"] as const,
  lists: ["requests", "list"] as const,
  list: (query: RequestListQuery) => ["requests", "list", query] as const,
  detail: (id: string) => ["requests", "detail", id] as const,
  history: (id: string) => ["requests", "history", id] as const,
  stats: ["stats"] as const,
  supervisors: ["users", "SUPERVISOR"] as const,
};

export function useRequestList(query: RequestListQuery) {
  return useQuery({
    queryKey: queryKeys.list(query),
    queryFn: () => listRequests(query),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.detail(id),
    queryFn: () => getRequest(id),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
}

export function useHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.history(id),
    queryFn: () => getHistory(id),
  });
}

export function useStats(enabled = true) {
  return useQuery({ queryKey: queryKeys.stats, queryFn: getStats, enabled });
}

export function useSupervisors(enabled = true) {
  return useQuery({
    queryKey: queryKeys.supervisors,
    queryFn: () => listUsers("SUPERVISOR"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Stores a request in the detail cache unless the cache already holds a newer version.
 * HTTP responses and WebSocket events race: the worker can claim a retried request and push
 * the IN_PROGRESS event before the retry's own (older) response arrives.
 */
export function storeRequest(queryClient: QueryClient, request: RequestDto) {
  queryClient.setQueryData<RequestDto>(queryKeys.detail(request.id), (cached) =>
    cached && cached.version > request.version ? cached : request,
  );
}

function applyRequest(queryClient: QueryClient, request: RequestDto) {
  storeRequest(queryClient, request);
  void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.history(request.id) });
}

/** A 409 means the request changed meanwhile: explain and reload it. */
function handleMutationError(queryClient: QueryClient, id: string, error: Error) {
  toast.error(error.message);
  if (error instanceof ApiError && error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.history(id) });
  }
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRequest,
    onSuccess: (request) => applyRequest(queryClient, request),
  });
}

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeStatusInput) => changeStatus(id, input),
    onSuccess: (request) => applyRequest(queryClient, request),
    onError: (error) => handleMutationError(queryClient, id, error),
  });
}

export function useUpdateRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRequestInput) => updateRequest(id, input),
    onSuccess: (request) => applyRequest(queryClient, request),
    onError: (error) => handleMutationError(queryClient, id, error),
  });
}
