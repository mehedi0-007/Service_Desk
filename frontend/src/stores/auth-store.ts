import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserDto } from "@/lib/types";

type AuthState = {
  token: string | null;
  user: UserDto | null;
  /** False until the persisted session has been read, so guards don't redirect too early. */
  hasHydrated: boolean;
  setSession: (token: string, user: UserDto) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "sd-auth",
      partialize: ({ token, user }) => ({ token, user }),
      // Rehydrated from an effect in Providers, so the first client render matches the server HTML.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
