import type { RequestDto, RequestStatus, UserDto } from "./types";

const CANCELLABLE: RequestStatus[] = ["QUEUED", "IN_PROGRESS"];
const RETRYABLE: RequestStatus[] = ["FAILED", "CANCELLED"];

export type AllowedActions = {
  cancel: boolean;
  retry: boolean;
  /** Change priority and assignment. */
  edit: boolean;
};

/**
 * Mirrors the backend state machine to decide which buttons to show.
 * The backend still enforces every rule.
 */
export function allowedActions(request: RequestDto, user: UserDto): AllowedActions {
  const supervisor = user.role === "SUPERVISOR";
  const owner = request.createdBy.id === user.id;
  return {
    cancel: CANCELLABLE.includes(request.status) && (supervisor || owner),
    retry: supervisor && RETRYABLE.includes(request.status),
    edit: supervisor,
  };
}
