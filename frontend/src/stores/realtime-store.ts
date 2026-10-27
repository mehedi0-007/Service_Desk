import { create } from "zustand";
import type { ProcessingStage, RequestStatus } from "@/lib/types";

export type ConnectionStatus = "connecting" | "live" | "offline";

export type FeedEvent = {
  id: string;
  referenceNo: number;
  kind: "created" | "updated" | "progress";
  status: RequestStatus;
  progress: number;
  stage: ProcessingStage | null;
  failureReason?: string | null;
  at: string;
};

const FEED_LIMIT = 20;
const FLASH_MS = 1500;
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

type RealtimeState = {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
  /** Newest first; one line per request. */
  events: FeedEvent[];
  pushEvent: (event: FeedEvent) => void;
  /** Requests that changed in the last moment, highlighted in lists. */
  flashedIds: string[];
  flash: (id: string) => void;
  reset: () => void;
};

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  status: "connecting",
  setStatus: (status) => set({ status }),

  events: [],
  pushEvent: (event) =>
    set(({ events }) => {
      const index = events.findIndex((e) => e.id === event.id);
      // Progress ticks update the request's line in place, so the feed doesn't jump every second.
      if (event.kind === "progress" && index !== -1) {
        const next = [...events];
        next[index] = { ...event, kind: "progress" };
        return { events: next };
      }
      // Anything else moves the request to the top.
      const rest = events.filter((e) => e.id !== event.id);
      return { events: [event, ...rest].slice(0, FEED_LIMIT) };
    }),

  flashedIds: [],
  flash: (id) => {
    clearTimeout(flashTimers.get(id));
    set(({ flashedIds }) => (flashedIds.includes(id) ? {} : { flashedIds: [...flashedIds, id] }));
    flashTimers.set(
      id,
      setTimeout(() => {
        flashTimers.delete(id);
        set(({ flashedIds }) => ({ flashedIds: flashedIds.filter((f) => f !== id) }));
      }, FLASH_MS),
    );
  },

  reset: () => {
    flashTimers.forEach(clearTimeout);
    flashTimers.clear();
    set({ status: "connecting", events: [], flashedIds: [] });
  },
}));
