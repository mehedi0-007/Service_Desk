export const ROLES = ["OPERATOR", "SUPERVISOR"] as const;
export type Role = (typeof ROLES)[number];

export const REQUEST_STATUSES = [
  "QUEUED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const REQUEST_CATEGORIES = [
  "HARDWARE",
  "SOFTWARE",
  "NETWORK",
  "ACCESS",
  "OTHER",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export type ProcessingStage = "VALIDATING" | "PROCESSING" | "FINALIZING";

export type UserSummary = { id: string; name: string };

export type UserDto = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type RequestDto = {
  id: string;
  referenceNo: number;
  title: string;
  description: string;
  category: RequestCategory;
  priority: RequestPriority;
  status: RequestStatus;
  progress: number;
  stage: ProcessingStage | null;
  attempts: number;
  failureReason: string | null;
  version: number;
  createdBy: UserSummary;
  assignedTo: UserSummary | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type Paginated<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type HistoryEntryDto = {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  note: string | null;
  /** null = System */
  changedBy: UserSummary | null;
  createdAt: string;
};

export type StatsDto = {
  total: number;
  byStatus: Record<RequestStatus, number>;
  byPriority: Record<RequestPriority, number>;
  avgProcessingSeconds: number | null;
  /** waiting/active are null while the queue is unreachable. */
  queue: {
    waiting: number | null;
    active: number | null;
    workerConcurrency: number;
  };
  generatedAt: string;
};

/** Returned by login and refresh; the refresh token itself only travels in an httpOnly cookie. */
export type LoginResponse = { accessToken: string; expiresIn: number; user: UserDto };

export type ChangePasswordInput = { currentPassword: string; newPassword: string };

export type SessionRevokeReason = "LOGOUT" | "LOGOUT_ALL" | "PASSWORD_CHANGED" | "TOKEN_REUSE";

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details: unknown;
  path: string;
  timestamp: string;
  requestId: string;
};

export type FieldErrorDetail = { field: string; messages: string[] };

export type RequestSortBy = "createdAt" | "updatedAt" | "priority" | "referenceNo";

export type RequestListQuery = {
  q?: string;
  status?: RequestStatus[];
  priority?: RequestPriority[];
  category?: RequestCategory;
  sortBy?: RequestSortBy;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type CreateRequestInput = {
  title: string;
  description: string;
  category: RequestCategory;
  priority?: RequestPriority;
};

export type UpdateRequestInput = {
  priority?: RequestPriority;
  assignedToId?: string | null;
  version: number;
};

export type ChangeStatusInput = {
  status: "QUEUED" | "CANCELLED";
  note?: string;
  version: number;
};

export type RequestProgressEvent = {
  id: string;
  referenceNo: number;
  status: RequestStatus;
  progress: number;
  stage: ProcessingStage | null;
  updatedAt: string;
};
