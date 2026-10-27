import { useAuthStore } from "@/stores/auth-store";
import type {
  ApiErrorBody,
  ChangeStatusInput,
  CreateRequestInput,
  HistoryEntryDto,
  LoginResponse,
  Paginated,
  RequestDto,
  RequestListQuery,
  Role,
  StatsDto,
  UpdateRequestInput,
  UserDto,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type QueryValue = string | number | string[] | undefined;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `${API_URL}${path}${search ? `?${search}` : ""}`;
}

export async function api<T>(
  path: string,
  init: RequestInit & { query?: Record<string, QueryValue> } = {},
): Promise<T> {
  const { query, headers, ...rest } = init;
  const token = useAuthStore.getState().token;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection.");
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  const error = new ApiError(
    response.status,
    body?.code ?? "INTERNAL_ERROR",
    body?.message ?? `Request failed with status ${response.status}`,
    body?.details ?? null,
  );

  // An expired or revoked session: start over at the login page.
  if (response.status === 401 && path !== "/auth/login") {
    useAuthStore.getState().logout();
    window.location.assign("/login");
  }
  throw error;
}

export const login = (email: string, password: string) =>
  api<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const me = () => api<UserDto>("/auth/me");

export const listUsers = (role?: Role) =>
  api<UserDto[]>("/users", { query: { role } });

export const listRequests = (query: RequestListQuery) =>
  api<Paginated<RequestDto>>("/requests", { query });

export const getRequest = (id: string) => api<RequestDto>(`/requests/${id}`);

export const getHistory = (id: string) =>
  api<HistoryEntryDto[]>(`/requests/${id}/history`);

export const createRequest = (input: CreateRequestInput) =>
  api<RequestDto>("/requests", { method: "POST", body: JSON.stringify(input) });

export const updateRequest = (id: string, input: UpdateRequestInput) =>
  api<RequestDto>(`/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const changeStatus = (id: string, input: ChangeStatusInput) =>
  api<RequestDto>(`/requests/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const getStats = () => api<StatsDto>("/requests/stats");
