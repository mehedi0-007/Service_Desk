import { create } from "zustand";
import type { UserDto } from "@/lib/types";

/**
 * - `checking`: on page load, until the refresh cookie has been exchanged for an access token.
 * - `authenticated`: an access token is in memory.
 * - `anonymous`: no session; guarded pages send the user to the login page.
 */
export type AuthStatus = "checking" | "authenticated" | "anonymous";

type AuthState = {
  status: AuthStatus;
  /** Kept in memory only: a script injected into the page cannot find it in storage. */
  token: string | null;
  /** When the access token expires (ms since epoch). */
  expiresAt: number | null;
  user: UserDto | null;
  setSession: (token: string, expiresIn: number, user: UserDto) => void;
  clear: () => void;
};

// Not a credential: only whether this browser signed in, so a visitor who never did is not sent
// to the refresh endpoint (and its 401) on every page load.
const SESSION_HINT = "sd-signed-in";

export function hadSession(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === "1";
  } catch {
    return true;
  }
}

function setHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT, "1");
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // Storage blocked: the app still works, it just always asks the server.
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: "checking",
  token: null,
  expiresAt: null,
  user: null,
  setSession: (token, expiresIn, user) => {
    setHint(true);
    set({ status: "authenticated", token, expiresAt: Date.now() + expiresIn * 1000, user });
  },
  clear: () => {
    setHint(false);
    set({ status: "anonymous", token: null, expiresAt: null, user: null });
  },
}));
