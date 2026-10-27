import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, RequestStatus, Role } from '@prisma/client';
import { PaginatedResponse, toPaginated } from '../common/dto/pagination.dto';
import {
  AppException,
  ErrorCode,
  invalidTransition,
  notFound,
  versionConflict,
} from '../common/errors/app-error';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RequestQueueService } from '../processing/request-queue.service';
import { UsersService } from '../users/users.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsQuery, UNASSIGNED } from './dto/list-requests.query';
import { HistoryEntryDto, RequestDto } from './dto/request.response';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestRow, toHistoryDto, toRequestDto } from './request.mapper';
import { assertTransition } from './request-state-machine';
import { RequestListFilter, RequestsRepository } from './requests.repository';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_NOTES: Record<ChangeStatusDto['status'], string> = {
  [RequestStatus.CANCELLED]: 'Cancelled',
  [RequestStatus.QUEUED]: 'Retried',
};

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly repository: RequestsRepository,
    private readonly queue: RequestQueueService,
    private readonly users: UsersService,
  ) {}

  async create(
    dto: CreateRequestDto,
    user: AuthenticatedUser,
  ): Promise<RequestDto> {
    const created = await this.repository.create(dto, user.id);
    const request = await this.enqueueAfterCommit(created);
    return toRequestDto(request);
  }

  async list(
    query: ListRequestsQuery,
    user: AuthenticatedUser,
  ): Promise<PaginatedResponse<RequestDto>> {
    const [rows, total] = await this.repository.list(
      this.toFilter(query, user),
      { sortBy: query.sortBy, sortOrder: query.sortOrder },
      query.page,
      query.pageSize,
    );
    return toPaginated(
      rows.map(toRequestDto),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(id: string, user: AuthenticatedUser): Promise<RequestDto> {
    return toRequestDto(await this.findVisible(id, user));
  }

  async history(
    id: string,
    user: AuthenticatedUser,
  ): Promise<HistoryEntryDto[]> {
    await this.findVisible(id, user);
    const rows = await this.repository.findHistory(id);
    return rows.map(toHistoryDto);
  }

  async update(
    id: string,
    dto: UpdateRequestDto,
    user: AuthenticatedUser,
  ): Promise<RequestDto> {
    if (dto.priority === undefined && dto.assignedToId === undefined) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Provide priority or assignedToId to update',
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = await this.findVisible(id, user);
    if (current.version !== dto.version) {
      throw versionConflict();
    }
    if (dto.assignedToId) {
      await this.users.assertSupervisor(dto.assignedToId);
    }

    const updated = await this.repository.updateFields(id, dto.version, {
      priority: dto.priority,
      assignedToId: dto.assignedToId,
    });
    if (updated === 0) {
      throw versionConflict();
    }
    return toRequestDto(await this.findOrFail(id));
  }

  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    user: AuthenticatedUser,
  ): Promise<RequestDto> {
    const current = await this.findVisible(id, user);
    assertTransition(
      current.status,
      dto.status,
      { kind: 'USER', userId: user.id, role: user.role },
      current.createdById,
    );
    if (current.version !== dto.version) {
      throw versionConflict();
    }

    const updated = await this.repository.transition({
      id,
      from: current.status,
      to: dto.status,
      expectedVersion: dto.version,
      data: this.statusChangeData(dto.status),
      actorId: user.id,
      note: dto.note || DEFAULT_NOTES[dto.status],
    });
    if (updated === 0) {
      // Lost the race: tell the caller whether the status or only the version moved on.
      const latest = await this.findOrFail(id);
      throw latest.status !== current.status
        ? invalidTransition(latest.status, dto.status)
        : versionConflict();
    }

    // Queue operations happen only after the database change is committed.
    let request = await this.findOrFail(id);
    if (dto.status === RequestStatus.CANCELLED && current.queueJobId) {
      await this.queue.remove(current.queueJobId);
    }
    if (dto.status === RequestStatus.QUEUED) {
      request = await this.enqueueAfterCommit(request);
    }
    return toRequestDto(request);
  }

  private statusChangeData(
    target: ChangeStatusDto['status'],
  ): Prisma.ServiceRequestUpdateManyMutationInput {
    if (target === RequestStatus.CANCELLED) {
      return { finishedAt: new Date(), queueJobId: null };
    }
    return {
      progress: 0,
      stage: null,
      failureReason: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  /**
   * Enqueues processing for a committed QUEUED request. If Redis is unavailable the request
   * stays QUEUED without a job and startup recovery enqueues it later.
   */
  private async enqueueAfterCommit(request: RequestRow): Promise<RequestRow> {
    try {
      const queueJobId = await this.queue.enqueue(request.id, request.version);
      await this.repository.setQueueJobId(request.id, queueJobId);
      return { ...request, queueJobId };
    } catch (error) {
      this.logger.warn(
        `Could not enqueue request ${request.id}: ${String(error)}`,
      );
      return request;
    }
  }

  /** Operators only see their own requests; others are reported as not found. */
  private async findVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<RequestRow> {
    const request = await this.repository.findById(id);
    if (
      !request ||
      (user.role === Role.OPERATOR && request.createdById !== user.id)
    ) {
      throw notFound('Request');
    }
    return request;
  }

  private async findOrFail(id: string): Promise<RequestRow> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw notFound('Request');
    }
    return request;
  }

  private toFilter(
    query: ListRequestsQuery,
    user: AuthenticatedUser,
  ): RequestListFilter {
    const createdFrom = query.createdFrom
      ? new Date(query.createdFrom)
      : undefined;
    const createdTo = query.createdTo
      ? new Date(
          DATE_ONLY.test(query.createdTo)
            ? `${query.createdTo}T23:59:59.999Z`
            : query.createdTo,
        )
      : undefined;
    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'createdTo',
            messages: ['createdTo must not be earlier than createdFrom'],
          },
        ],
      );
    }

    const filter: RequestListFilter = {
      q: query.q || undefined,
      status: query.status,
      priority: query.priority,
      category: query.category,
      createdFrom,
      createdTo,
    };

    if (user.role === Role.OPERATOR) {
      // Operators are limited to their own requests regardless of the filters they send.
      filter.createdById = user.id;
    } else {
      filter.createdById = query.createdById;
      filter.assignedToId =
        query.assignedToId === UNASSIGNED ? null : query.assignedToId;
    }
    return filter;
  }
}
