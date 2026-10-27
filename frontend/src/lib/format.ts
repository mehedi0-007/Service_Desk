import type {
  ProcessingStage,
  RequestCategory,
  RequestPriority,
  RequestStatus,
  Role,
} from "./types";

export const formatRef = (referenceNo: number) =>
  `SR-${String(referenceNo).padStart(5, "0")}`;

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "medium" });

export const formatDateTime = (iso: string | null) =>
  iso ? dateTimeFormat.format(new Date(iso)) : "—";

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export const STATUS_LABELS: Record<RequestStatus, string> = {
  QUEUED: "Queued",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<RequestPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  NETWORK: "Network",
  ACCESS: "Access",
  OTHER: "Other",
};

export const STAGE_LABELS: Record<ProcessingStage, string> = {
  VALIDATING: "Validating",
  PROCESSING: "Processing",
  FINALIZING: "Finalizing",
};

export const ROLE_LABELS: Record<Role, string> = {
  OPERATOR: "Operator",
  SUPERVISOR: "Supervisor",
};
