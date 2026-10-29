import { ApiError, request, type RequestOptions } from "./http";
import { endSession, getAccessToken, refreshSession } from "./session";
import type {
  ChangePasswordInput,
  ChangeStatusInput,
  CreateRequestInput,
  HistoryEntryDto,
  Paginated,
  RequestDto,
  RequestListQuery,
  Role,
  StatsDto,
  UpdateRequestInput,
  UserDto,
} from "./types";

export { ApiError };

const withToken = (init: RequestOptions, token: string | null): RequestOptions => ({
  ...init,
  headers: { ...init.headers, ...(token && { Authorization: `Bearer ${token}` }) },
});

/**
 * An authenticated API call. A 401 means the access token expired or its session was revoked:
 * the session is renewed once and the call repeated. If that fails the session has ended, the
 * auth store becomes anonymous and the app layout sends the user to the login page.
 */
export async function api<T>(path: string, init: RequestOptions = {}): Promise<T> {
  try {
    return await request<T>(path, withToken(init, await getAccessToken()));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const token = await refreshSession();
    if (!token) throw error;
    return request<T>(path, withToken(init, token));
  }
}

export const listUsers = (role?: Role) => api<UserDto[]>("/users", { query: { role } });

export const listRequests = (query: RequestListQuery) =>
  api<Paginated<RequestDto>>("/requests", { query });

export const getRequest = (id: string) => api<RequestDto>(`/requests/${id}`);

export const getHistory = (id: string) => api<HistoryEntryDto[]>(`/requests/${id}/history`);

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

export const changePassword = (input: ChangePasswordInput) =>
  api<void>("/auth/password", { method: "PATCH", body: JSON.stringify(input) });

/** Ends every session of the user, this one included. */
export async function signOutEverywhere(): Promise<void> {
  await api<void>("/auth/logout-all", { method: "POST", credentials: "include" });
  endSession();
}
