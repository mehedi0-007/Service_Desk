import { Injectable } from '@nestjs/common';
import {
  ProcessingStage,
  Prisma,
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  HISTORY_INCLUDE,
  HistoryRow,
  REQUEST_INCLUDE,
  RequestRow,
} from './request.mapper';

export type CreateRequestInput = {
  title: string;
  description: string;
  category: RequestCategory;
  priority?: RequestPriority;
};

export type RequestListFilter = {
  q?: string;
  status?: RequestStatus[];
  priority?: RequestPriority[];
  category?: RequestCategory;
  /** null selects unassigned requests. */
  assignedToId?: string | null;
  createdById?: string;
  createdFrom?: Date;
  createdTo?: Date;
};

export type RequestSortField =
  'createdAt' | 'updatedAt' | 'priority' | 'referenceNo';

export type RequestSort = {
  sortBy: RequestSortField;
  sortOrder: Prisma.SortOrder;
};

export type RequestCounts = {
  byStatus: { status: RequestStatus; count: number }[];
  byPriority: { priority: RequestPriority; count: number }[];
  avgProcessingSeconds: number | null;
};

export type TransitionInput = {
  id: string;
  from: RequestStatus;
  to: RequestStatus;
  /** Omitted for system transitions, which are guarded by status only. */
  expectedVersion?: number;
  data?: Prisma.ServiceRequestUpdateManyMutationInput;
  /** null records the change as made by the system. */
  actorId: string | null;
  note?: string | null;
};

// Matches "SR-00042", "sr-42" and "42" for reference number search.
const REFERENCE_PATTERN = /^(?:SR-)?0*(\d{1,9})$/i;

/** The only class that reads or writes service requests and their history. */
@Injectable()
export class RequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRequestInput, actorId: string): Promise<RequestRow> {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: { ...input, status: RequestStatus.QUEUED, createdById: actorId },
        include: REQUEST_INCLUDE,
      });
      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: RequestStatus.QUEUED,
          changedById: actorId,
          note: 'Request submitted',
        },
      });
      return request;
    });
  }

  findById(id: string): Promise<RequestRow | null> {
    return this.prisma.serviceRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
  }

  list(
    filter: RequestListFilter,
    sort: RequestSort,
    page: number,
    pageSize: number,
  ): Promise<[RequestRow[], number]> {
    const where = this.buildWhere(filter);
    // Page and count run in parallel on two connections. A transaction would add BEGIN/COMMIT
    // round trips and run them one after the other, for a count that is only a page hint anyway.
    return Promise.all([
      this.prisma.serviceRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        // Postgres sorts enums in declaration order, so priority sorts LOW to URGENT.
        // The unique reference number breaks ties, so pages never repeat or skip rows.
        orderBy:
          sort.sortBy === 'referenceNo'
            ? { referenceNo: sort.sortOrder }
            : [
                { [sort.sortBy]: sort.sortOrder },
                { referenceNo: sort.sortOrder },
              ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
  }

  /**
   * Compare-and-set status change: applies only while the row still has the expected status
   * (and version, when given), and records history in the same transaction.
   * Returns the number of updated rows; 0 means someone else changed the request first.
   */
  transition(input: TransitionInput): Promise<number> {
    const { id, from, to, expectedVersion, data, actorId, note } = input;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.serviceRequest.updateMany({
        where: {
          id,
          status: from,
          ...(expectedVersion !== undefined && { version: expectedVersion }),
        },
        data: { ...data, status: to, version: { increment: 1 } },
      });
      if (count === 1) {
        await tx.requestStatusHistory.create({
          data: {
            requestId: id,
            fromStatus: from,
            toStatus: to,
            changedById: actorId,
            note: note ?? null,
          },
        });
      }
      return count;
    });
  }

  /** Optimistically locked update of non-status fields (priority, assignment). */
  async updateFields(
    id: string,
    expectedVersion: number,
    data: Prisma.ServiceRequestUncheckedUpdateManyInput,
  ): Promise<number> {
    const { count } = await this.prisma.serviceRequest.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    return count;
  }

  /** Bookkeeping only: the version is unchanged, so it never conflicts with user edits. */
  async setQueueJobId(id: string, queueJobId: string): Promise<void> {
    await this.prisma.serviceRequest.update({
      where: { id },
      data: { queueJobId },
    });
  }

  /**
   * Progress ticks write only while the request is still IN_PROGRESS, so a user's cancel is
   * never overwritten. The version is not bumped: otherwise users could never win a race
   * against a running job. Returns 0 when the request is no longer in progress.
   */
  async updateProgress(
    id: string,
    progress: number,
    stage: ProcessingStage,
  ): Promise<number> {
    const { count } = await this.prisma.serviceRequest.updateMany({
      where: { id, status: RequestStatus.IN_PROGRESS },
      data: { progress, stage },
    });
    return count;
  }

  findByStatus(statuses: RequestStatus[]): Promise<RequestRow[]> {
    return this.prisma.serviceRequest.findMany({
      where: { status: { in: statuses } },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  findHistory(requestId: string): Promise<HistoryRow[]> {
    return this.prisma.requestStatusHistory.findMany({
      where: { requestId },
      include: HISTORY_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async stats(): Promise<RequestCounts> {
    const [byStatus, byPriority, [average]] = await Promise.all([
      this.prisma.serviceRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.serviceRequest.groupBy({
        by: ['priority'],
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ seconds: number | null }[]>`
        SELECT EXTRACT(EPOCH FROM AVG(finished_at - started_at))::float8 AS seconds
        FROM service_requests
        WHERE status = 'COMPLETED' AND started_at IS NOT NULL AND finished_at IS NOT NULL`,
    ]);
    return {
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      byPriority: byPriority.map((row) => ({
        priority: row.priority,
        count: row._count._all,
      })),
      avgProcessingSeconds:
        average.seconds === null ? null : Math.round(average.seconds),
    };
  }

  private buildWhere(
    filter: RequestListFilter,
  ): Prisma.ServiceRequestWhereInput {
    const where: Prisma.ServiceRequestWhereInput = {
      status: filter.status ? { in: filter.status } : undefined,
      priority: filter.priority ? { in: filter.priority } : undefined,
      category: filter.category,
      assignedToId: filter.assignedToId,
      createdById: filter.createdById,
    };

    if (filter.createdFrom || filter.createdTo) {
      where.createdAt = { gte: filter.createdFrom, lte: filter.createdTo };
    }

    if (filter.q) {
      // Case-insensitive contains is served by the trigram indexes on title and description.
      const or: Prisma.ServiceRequestWhereInput[] = [
        { title: { contains: filter.q, mode: 'insensitive' } },
        { description: { contains: filter.q, mode: 'insensitive' } },
      ];
      const reference = REFERENCE_PATTERN.exec(filter.q);
      if (reference) {
        or.push({ referenceNo: Number(reference[1]) });
      }
      where.OR = or;
    }

    return where;
  }
}
