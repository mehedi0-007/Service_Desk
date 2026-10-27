"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { formatRef } from "@/lib/format";
import type { Paginated, RequestDto, RequestProgressEvent } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { queryKeys } from "./use-requests";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

/** Calls fn at most once per `ms`, after the last call. */
function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}

/**
 * Keeps the query cache in sync with server pushes. Mounted once for signed-in users.
 * Every screen re-renders from the cache, so no page polls or listens on its own.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!token || !user) return;
    const { setStatus, pushEvent, flash, reset } = useRealtimeStore.getState();
    const supervisor = user.role === "SUPERVISOR";
    // Last status seen per request, so an owner toast fires once per transition.
    const lastStatus = new Map<string, RequestDto["status"]>();

    const refreshLists = debounce(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
      300,
    );
    const refreshStats = debounce(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      1000,
    );

    const socket = io(`${WS_URL}/realtime`, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setStatus("live");
      // Catch up on anything missed while disconnected.
      void queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      if (supervisor) void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    });
    socket.on("disconnect", () => setStatus("offline"));
    socket.on("connect_error", () => setStatus("offline"));
    const onReconnectAttempt = () => setStatus("connecting");
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("error", (error: { code?: string }) => {
      if (error?.code === "UNAUTHORIZED") {
        useAuthStore.getState().logout();
        window.location.assign("/login");
      }
    });

    const onRequest = (kind: "created" | "updated") => ({ request }: { request: RequestDto }) => {
      queryClient.setQueryData(queryKeys.detail(request.id), request);
      void queryClient.invalidateQueries({ queryKey: queryKeys.history(request.id) });
      refreshLists();
      if (supervisor) refreshStats();

      flash(request.id);
      pushEvent({
        id: request.id,
        referenceNo: request.referenceNo,
        kind,
        status: request.status,
        progress: request.progress,
        stage: request.stage,
        failureReason: request.failureReason,
        at: request.updatedAt,
      });

      const previous = lastStatus.get(request.id);
      lastStatus.set(request.id, request.status);
      if (!supervisor && request.createdBy.id === user.id && previous !== request.status) {
        const ref = formatRef(request.referenceNo);
        if (request.status === "COMPLETED") toast.success(`${ref} completed`);
        if (request.status === "FAILED") {
          toast.error(`${ref} failed: ${request.failureReason ?? "unknown reason"}`);
        }
      }
    };

    socket.on("request.created", onRequest("created"));
    socket.on("request.updated", onRequest("updated"));

    socket.on("request.progress", (event: RequestProgressEvent) => {
      const patch = <T extends RequestDto>(request: T): T =>
        request.id === event.id
          ? {
              ...request,
              status: event.status,
              progress: event.progress,
              stage: event.stage,
              updatedAt: event.updatedAt,
            }
          : request;

      queryClient.setQueryData<RequestDto>(queryKeys.detail(event.id), (old) =>
        old ? patch(old) : old,
      );
      queryClient.setQueriesData<Paginated<RequestDto>>({ queryKey: queryKeys.lists }, (old) =>
        old ? { ...old, items: old.items.map(patch) } : old,
      );

      flash(event.id);
      pushEvent({ ...event, kind: "progress", at: event.updatedAt });
    });

    return () => {
      refreshLists.cancel();
      refreshStats.cancel();
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.removeAllListeners();
      socket.disconnect();
      reset();
    };
  }, [token, user, queryClient]);
}
