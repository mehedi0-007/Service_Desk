import { Injectable } from '@nestjs/common';
import {
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
    return this.prisma.$transaction([
      this.prisma.serviceRequest.findMany({
        where,
        include: REQUEST_INCLUDE,
        // Postgres sorts enums in declaration order, so priority sorts LOW to URGENT.
        orderBy: [{ [sort.sortBy]: sort.sortOrder }, { createdAt: 'desc' }],
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

  findHistory(requestId: string): Promise<HistoryRow[]> {
    return this.prisma.requestStatusHistory.findMany({
      where: { requestId },
      include: HISTORY_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
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
