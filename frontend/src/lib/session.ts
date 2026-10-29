import { useAuthStore } from "@/stores/auth-store";
import { ApiError, request } from "./http";
import type { LoginResponse, UserDto } from "./types";

/**
 * The session: a short-lived access token in memory and a refresh token in an httpOnly cookie
 * that only the API's auth routes receive. Cookie calls need `credentials: "include"` because
 * the API runs on another origin.
 */

type TabMessage = { type: "login" } | { type: "logout" };

// Tabs share the refresh cookie, so they keep each other informed about logins and logouts.
const tabs = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("sd-auth");

// Renew a little early, so a request never leaves with a token that expires on the way.
const EXPIRY_MARGIN_MS = 30_000;

function store(session: LoginResponse) {
  useAuthStore.getState().setSession(session.accessToken, session.expiresIn, session.user);
}

export async function signIn(email: string, password: string): Promise<UserDto> {
  const session = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  store(session);
  tabs?.postMessage({ type: "login" } satisfies TabMessage);
  return session.user;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token; resolves null when the session has ended.
 * Calls in this tab share one request, and tabs take turns (Web Locks), so every refresh sends
 * the newest cookie and two tabs never present the same token.
 */
export function refreshSession(): Promise<string | null> {
  refreshing ??= withLock(() => exchangeCookie(true)).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function exchangeCookie(retryOnConflict: boolean): Promise<string | null> {
  try {
    const session = await request<LoginResponse>("/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    store(session);
    return session.accessToken;
  } catch (error) {
    // Another request rotated the cookie a moment ago; the browser now holds the new one.
    if (error instanceof ApiError && error.status === 409 && retryOnConflict) {
      return exchangeCookie(false);
    }
    // Offline in the middle of a session: keep it and let the caller report the error.
    if (
      error instanceof ApiError &&
      error.status === 0 &&
      useAuthStore.getState().status === "authenticated"
    ) {
      throw error;
    }
    useAuthStore.getState().clear();
    return null;
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("sd-refresh", fn);
  }
  return fn();
}

/** A usable access token, renewed first if it is about to expire; null without a session. */
export async function getAccessToken(): Promise<string | null> {
  const { status, token, expiresAt } = useAuthStore.getState();
  if (token && expiresAt && expiresAt - Date.now() > EXPIRY_MARGIN_MS) return token;
  if (status === "anonymous") return null;
  return refreshSession();
}

/** Logs out on the server (cookie, or the access token where the cookie is blocked) and here. */
export async function signOut(): Promise<void> {
  const { token } = useAuthStore.getState();
  try {
    await request<void>("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // Signing out locally must work even when the server cannot be reached.
  }
  endSession();
}

/** Forgets the session in this tab and the others. */
export function endSession() {
  useAuthStore.getState().clear();
  tabs?.postMessage({ type: "logout" } satisfies TabMessage);
}

/** Follows logins and logouts in other tabs; returns the cleanup. */
export function watchOtherTabs(): () => void {
  if (!tabs) return () => {};
  const onMessage = ({ data }: MessageEvent<TabMessage>) => {
    if (data.type === "logout") useAuthStore.getState().clear();
    if (data.type === "login" && useAuthStore.getState().status !== "authenticated") {
      void refreshSession();
    }
  };
  tabs.addEventListener("message", onMessage);
  return () => tabs.removeEventListener("message", onMessage);
}
