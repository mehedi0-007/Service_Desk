"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { formatRef } from "@/lib/format";
import { getAccessToken, refreshSession } from "@/lib/session";
import type {
  Paginated,
  RequestDto,
  RequestProgressEvent,
  SessionRevokeReason,
} from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";
import { useRealtimeStore } from "@/stores/realtime-store";
import { queryKeys, storeRequest } from "./use-requests";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

// Shown when the server ends this session from elsewhere. A logout started in this browser
// needs no message.
const REVOKED_MESSAGES: Partial<Record<SessionRevokeReason, string>> = {
  LOGOUT_ALL: "You were signed out of all devices.",
  PASSWORD_CHANGED: "Your password was changed. Please sign in again.",
  TOKEN_REUSE: "Your session was ended for security reasons. Please sign in again.",
};

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
  // Only the user, not the token: a renewed token must not open a new connection.
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!userId || !role) return;
    const { setStatus, pushEvent, flash, reset } = useRealtimeStore.getState();
    const supervisor = role === "SUPERVISOR";
    let revoked = false;
    let authRetries = 0;
    // Requests already announced, so a repeated event never toasts twice.
    const announced = new Set<string>();

    const refreshLists = debounce(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
      300,
    );
    const refreshStats = debounce(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      1000,
    );

    const socket = io(`${WS_URL}/realtime`, {
      // Called on every (re)connect, so each handshake carries a current access token.
      auth: (send) => {
        getAccessToken().then(
          (token) => send({ token: token ?? "" }),
          () => send({ token: "" }),
        );
      },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      authRetries = 0;
      setStatus("live");
      // Catch up on anything missed while disconnected.
      void queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      if (supervisor) void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    });
    socket.on("disconnect", (reason) => {
      setStatus("offline");
      // The server closes the socket when its access token expires. Socket.IO does not
      // reconnect on its own after a server-side disconnect.
      if (reason === "io server disconnect" && !revoked) socket.connect();
    });
    socket.on("connect_error", () => setStatus("offline"));
    const onReconnectAttempt = () => setStatus("connecting");
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    // The handshake was rejected: renew the session once and try again. If the session has
    // ended, the auth store is now anonymous and the app layout goes to the login page.
    socket.on("error", (error: { code?: string }) => {
      if (error?.code !== "UNAUTHORIZED" || revoked || authRetries++ > 0) return;
      void refreshSession().then(
        (token) => token && socket.connect(),
        () => undefined,
      );
    });
    socket.on("session.revoked", ({ reason }: { reason: SessionRevokeReason }) => {
      revoked = true;
      const message = REVOKED_MESSAGES[reason];
      if (message) toast.info(message);
      useAuthStore.getState().clear();
    });

    const onRequest = (kind: "created" | "updated") => ({ request }: { request: RequestDto }) => {
      storeRequest(queryClient, request);
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

      // The finishing transition sets finishedAt and updatedAt together; a later priority or
      // assignment change only moves updatedAt, so it does not toast again.
      const justFinished =
        request.finishedAt !== null &&
        Date.parse(request.updatedAt) - Date.parse(request.finishedAt) < 1000;
      const key = `${request.id}:${request.finishedAt}`;
      if (!supervisor && request.createdBy.id === userId && justFinished && !announced.has(key)) {
        announced.add(key);
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
  }, [userId, role, queryClient]);
}
