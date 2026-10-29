import type { ApiErrorBody } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type QueryValue = string | number | string[] | undefined;

export type RequestOptions = RequestInit & { query?: Record<string, QueryValue> };

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

/** One HTTP call to the API, without authentication. Errors become ApiError. */
export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { query, headers, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: { "Content-Type": "application/json", ...headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection.");
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  throw new ApiError(
    response.status,
    body?.code ?? "INTERNAL_ERROR",
    body?.message ?? `Request failed with status ${response.status}`,
    body?.details ?? null,
  );
}
