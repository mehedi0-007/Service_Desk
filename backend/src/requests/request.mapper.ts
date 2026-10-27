import { Prisma } from '@prisma/client';
import { HistoryEntryDto, RequestDto } from './dto/request.response';

const USER_SUMMARY = { select: { id: true, name: true } } as const;

export const REQUEST_INCLUDE = {
  createdBy: USER_SUMMARY,
  assignedTo: USER_SUMMARY,
} satisfies Prisma.ServiceRequestInclude;

export const HISTORY_INCLUDE = {
  changedBy: USER_SUMMARY,
} satisfies Prisma.RequestStatusHistoryInclude;

export type RequestRow = Prisma.ServiceRequestGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

export type HistoryRow = Prisma.RequestStatusHistoryGetPayload<{
  include: typeof HISTORY_INCLUDE;
}>;

const toIso = (date: Date | null): string | null => date?.toISOString() ?? null;

export function toRequestDto(row: RequestRow): RequestDto {
  return {
    id: row.id,
    referenceNo: row.referenceNo,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    stage: row.stage,
    attempts: row.attempts,
    failureReason: row.failureReason,
    version: row.version,
    createdBy: row.createdBy,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
  };
}

export function toHistoryDto(row: HistoryRow): HistoryEntryDto {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  };
}
