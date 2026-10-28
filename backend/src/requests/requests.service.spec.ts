import { HttpStatus, Logger } from '@nestjs/common';
import {
  RequestCategory,
  RequestPriority,
  RequestStatus,
  Role,
} from '@prisma/client';
import { AppException, ErrorCode } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RequestQueueService } from '../processing/request-queue.service';
import { UsersService } from '../users/users.service';
import { RequestEventsPublisher } from './request-events';
import { RequestRow } from './request.mapper';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';

const owner: AuthenticatedUser = {
  id: 'owner-id',
  email: 'owner@demo.test',
  name: 'Olivia Operator',
  role: Role.OPERATOR,
};
const otherOperator: AuthenticatedUser = {
  ...owner,
  id: 'other-id',
  email: 'other@demo.test',
};
const supervisor: AuthenticatedUser = {
  id: 'supervisor-id',
  email: 'supervisor@demo.test',
  name: 'Sam Supervisor',
  role: Role.SUPERVISOR,
};

function row(overrides: Partial<RequestRow> = {}): RequestRow {
  const now = new Date('2026-10-27T10:00:00.000Z');
  return {
    id: 'request-id',
    referenceNo: 42,
    title: 'VPN drops',
    description: 'The VPN disconnects every few minutes.',
    category: RequestCategory.NETWORK,
    priority: RequestPriority.MEDIUM,
    status: RequestStatus.QUEUED,
    progress: 0,
    stage: null,
    attempts: 0,
    failureReason: null,
    version: 1,
    queueJobId: null,
    createdById: owner.id,
    assignedToId: null,
    createdBy: { id: owner.id, name: owner.name },
    assignedTo: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

const expectAppError = async (
  promise: Promise<unknown>,
  code: ErrorCode,
  status: HttpStatus,
) => {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
  expect((error as AppException).getStatus()).toBe(status);
};

describe('RequestsService', () => {
  // The failure paths log on purpose; keep the test output readable.
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  let repository: jest.Mocked<
    Pick<
      RequestsRepository,
      | 'create'
      | 'findById'
      | 'transition'
      | 'updateFields'
      | 'setQueueJobId'
      | 'findHistory'
    >
  >;
  let queue: jest.Mocked<Pick<RequestQueueService, 'enqueue' | 'remove'>>;
  let users: jest.Mocked<Pick<UsersService, 'assertSupervisor'>>;
  let events: jest.Mocked<Pick<RequestEventsPublisher, 'created' | 'updated'>>;
  let service: RequestsService;
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      transition: jest.fn(),
      updateFields: jest.fn(),
      setQueueJobId: jest.fn().mockResolvedValue(undefined),
      findHistory: jest.fn(),
    };
    queue = {
      enqueue: jest.fn().mockImplementation((id: string, version: number) => {
        calls.push('enqueue');
        return Promise.resolve(`${id}-v${version}`);
      }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    users = { assertSupervisor: jest.fn().mockResolvedValue(undefined) };
    events = {
      created: jest.fn(() => calls.push('created')),
      updated: jest.fn(),
    };
    service = new RequestsService(
      repository as unknown as RequestsRepository,
      queue as unknown as RequestQueueService,
      users as unknown as UsersService,
      events as unknown as RequestEventsPublisher,
    );
  });

  describe('create', () => {
    it('enqueues after the row is committed, then publishes created', async () => {
      repository.create.mockImplementation(() => {
        calls.push('repository.create');
        return Promise.resolve(row());
      });

      const result = await service.create(
        {
          title: 'VPN drops',
          description: 'The VPN disconnects every few minutes.',
          category: RequestCategory.NETWORK,
        },
        owner,
      );

      expect(calls).toEqual(['repository.create', 'enqueue', 'created']);
      expect(repository.setQueueJobId).toHaveBeenCalledWith(
        'request-id',
        'request-id-v1',
      );
      expect(result.status).toBe(RequestStatus.QUEUED);
      expect(events.created).toHaveBeenCalledWith(result);
    });

    it('still returns the request when the queue is unavailable', async () => {
      repository.create.mockResolvedValue(row());
      queue.enqueue.mockRejectedValue(new Error('Redis is not connected'));

      const result = await service.create(
        { title: 'VPN', description: 'Long enough text', category: 'OTHER' },
        owner,
      );

      expect(result.id).toBe('request-id');
      expect(repository.setQueueJobId).not.toHaveBeenCalled();
      expect(events.created).toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it("reports another operator's request as not found", async () => {
      repository.findById.mockResolvedValue(row());

      await expectAppError(
        service.get('request-id', otherOperator),
        ErrorCode.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
      await expectAppError(
        service.history('request-id', otherOperator),
        ErrorCode.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
      expect(repository.findHistory).not.toHaveBeenCalled();
    });

    it('lets supervisors and the owner read the request', async () => {
      repository.findById.mockResolvedValue(row());

      await expect(service.get('request-id', owner)).resolves.toMatchObject({
        id: 'request-id',
      });
      await expect(
        service.get('request-id', supervisor),
      ).resolves.toMatchObject({ id: 'request-id' });
    });
  });

  describe('changeStatus', () => {
    it('rejects a stale version without writing', async () => {
      repository.findById.mockResolvedValue(row({ version: 3 }));

      await expectAppError(
        service.changeStatus(
          'request-id',
          { status: RequestStatus.CANCELLED, version: 2 },
          owner,
        ),
        ErrorCode.VERSION_CONFLICT,
        HttpStatus.CONFLICT,
      );
      expect(repository.transition).not.toHaveBeenCalled();
    });

    it('reports INVALID_TRANSITION when the status changed during the write', async () => {
      repository.findById
        .mockResolvedValueOnce(row({ status: RequestStatus.IN_PROGRESS }))
        .mockResolvedValueOnce(
          row({ status: RequestStatus.COMPLETED, version: 2 }),
        );
      repository.transition.mockResolvedValue(0);

      await expectAppError(
        service.changeStatus(
          'request-id',
          { status: RequestStatus.CANCELLED, version: 1 },
          owner,
        ),
        ErrorCode.INVALID_TRANSITION,
        HttpStatus.CONFLICT,
      );
    });

    it('reports VERSION_CONFLICT when only the version changed during the write', async () => {
      repository.findById
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(row({ version: 2 }));
      repository.transition.mockResolvedValue(0);

      await expectAppError(
        service.changeStatus(
          'request-id',
          { status: RequestStatus.CANCELLED, version: 1 },
          owner,
        ),
        ErrorCode.VERSION_CONFLICT,
        HttpStatus.CONFLICT,
      );
    });

    it('cancel removes the waiting job and publishes the update', async () => {
      repository.findById
        .mockResolvedValueOnce(row({ queueJobId: 'request-id-v1' }))
        .mockResolvedValueOnce(
          row({ status: RequestStatus.CANCELLED, version: 2 }),
        );
      repository.transition.mockResolvedValue(1);

      const result = await service.changeStatus(
        'request-id',
        { status: RequestStatus.CANCELLED, version: 1 },
        owner,
      );

      expect(repository.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          from: RequestStatus.QUEUED,
          to: RequestStatus.CANCELLED,
          expectedVersion: 1,
          actorId: owner.id,
          note: 'Cancelled',
          data: expect.objectContaining({ queueJobId: null }) as unknown,
        }),
      );
      expect(queue.remove).toHaveBeenCalledWith('request-id-v1');
      expect(result.status).toBe(RequestStatus.CANCELLED);
      expect(events.updated).toHaveBeenCalledWith(result);
    });

    it('retry resets processing fields and enqueues the new version', async () => {
      repository.findById
        .mockResolvedValueOnce(
          row({
            status: RequestStatus.FAILED,
            version: 4,
            progress: 58,
            failureReason: 'Simulated processing error',
          }),
        )
        .mockResolvedValueOnce(
          row({ status: RequestStatus.QUEUED, version: 5 }),
        );
      repository.transition.mockResolvedValue(1);

      await service.changeStatus(
        'request-id',
        { status: RequestStatus.QUEUED, version: 4 },
        supervisor,
      );

      expect(repository.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          from: RequestStatus.FAILED,
          to: RequestStatus.QUEUED,
          note: 'Retried',
          data: {
            progress: 0,
            stage: null,
            failureReason: null,
            startedAt: null,
            finishedAt: null,
          },
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith('request-id', 5);
    });

    it('does not let an operator retry', async () => {
      repository.findById.mockResolvedValue(
        row({ status: RequestStatus.FAILED }),
      );

      await expectAppError(
        service.changeStatus(
          'request-id',
          { status: RequestStatus.QUEUED, version: 1 },
          owner,
        ),
        ErrorCode.FORBIDDEN,
        HttpStatus.FORBIDDEN,
      );
    });
  });

  describe('update', () => {
    it('requires priority or assignee', async () => {
      await expectAppError(
        service.update('request-id', { version: 1 }, supervisor),
        ErrorCode.BAD_REQUEST,
        HttpStatus.BAD_REQUEST,
      );
    });

    it('rejects assigning someone who is not a supervisor', async () => {
      repository.findById.mockResolvedValue(row());
      users.assertSupervisor.mockRejectedValue(
        new AppException(
          ErrorCode.BAD_REQUEST,
          'Assignee must be a supervisor',
          HttpStatus.BAD_REQUEST,
        ),
      );

      await expectAppError(
        service.update(
          'request-id',
          { assignedToId: owner.id, version: 1 },
          supervisor,
        ),
        ErrorCode.BAD_REQUEST,
        HttpStatus.BAD_REQUEST,
      );
      expect(repository.updateFields).not.toHaveBeenCalled();
    });

    it('reports VERSION_CONFLICT when the guarded write matches no row', async () => {
      repository.findById.mockResolvedValue(row());
      repository.updateFields.mockResolvedValue(0);

      await expectAppError(
        service.update(
          'request-id',
          { priority: RequestPriority.URGENT, version: 1 },
          supervisor,
        ),
        ErrorCode.VERSION_CONFLICT,
        HttpStatus.CONFLICT,
      );
      expect(events.updated).not.toHaveBeenCalled();
    });
  });
});
