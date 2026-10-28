import {
  PrismaClient,
  RequestCategory,
  RequestPriority,
  RequestStatus,
  Role,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const DEMO_PASSWORD = 'Password123!';

const USERS = [
  {
    email: 'operator1@demo.test',
    name: 'Olivia Operator',
    role: Role.OPERATOR,
  },
  { email: 'operator2@demo.test', name: 'Oscar Operator', role: Role.OPERATOR },
  {
    email: 'supervisor@demo.test',
    name: 'Sam Supervisor',
    role: Role.SUPERVISOR,
  },
  {
    email: 'supervisor2@demo.test',
    name: 'Sara Supervisor',
    role: Role.SUPERVISOR,
  },
] as const;

type SampleRequest = {
  title: string;
  description: string;
  category: RequestCategory;
  priority: RequestPriority;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  owner: 0 | 1;
  assignee?: 2 | 3;
  hoursAgo: number;
};

const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    title: 'Laptop does not boot',
    description: 'Black screen after the latest operating system update.',
    category: 'HARDWARE',
    priority: 'HIGH',
    status: 'COMPLETED',
    owner: 0,
    assignee: 2,
    hoursAgo: 70,
  },
  {
    title: 'VPN disconnects every hour',
    description: 'Remote VPN session drops roughly every sixty minutes.',
    category: 'NETWORK',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    owner: 1,
    hoursAgo: 66,
  },
  {
    title: 'Access to finance share',
    description: 'New team member needs read access to the finance file share.',
    category: 'ACCESS',
    priority: 'LOW',
    status: 'COMPLETED',
    owner: 0,
    assignee: 3,
    hoursAgo: 52,
  },
  {
    title: 'Install design software',
    description: 'Please install the licensed design suite on workstation 14.',
    category: 'SOFTWARE',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    owner: 1,
    hoursAgo: 47,
  },
  {
    title: 'Printer on floor 2 jams',
    description: 'The shared printer jams on every double-sided print job.',
    category: 'HARDWARE',
    priority: 'LOW',
    status: 'COMPLETED',
    owner: 0,
    hoursAgo: 30,
  },
  {
    title: 'Email client crashes on start',
    description:
      'Mail client closes immediately after opening since this morning.',
    category: 'SOFTWARE',
    priority: 'URGENT',
    status: 'COMPLETED',
    owner: 1,
    assignee: 2,
    hoursAgo: 20,
  },
  {
    title: 'Wi-Fi unavailable in meeting room',
    description: 'No wireless network is visible in meeting room B.',
    category: 'NETWORK',
    priority: 'HIGH',
    status: 'FAILED',
    owner: 0,
    assignee: 2,
    hoursAgo: 26,
  },
  {
    title: 'Reset multi-factor device',
    description:
      'Lost phone; the multi-factor authentication device must be reset.',
    category: 'ACCESS',
    priority: 'URGENT',
    status: 'FAILED',
    owner: 1,
    hoursAgo: 14,
  },
  {
    title: 'Database client licence expired',
    description: 'The database client reports an expired licence key.',
    category: 'SOFTWARE',
    priority: 'MEDIUM',
    status: 'FAILED',
    owner: 0,
    hoursAgo: 9,
  },
  {
    title: 'Order second monitor',
    description: 'Request for an additional monitor for the reception desk.',
    category: 'OTHER',
    priority: 'LOW',
    status: 'CANCELLED',
    owner: 1,
    hoursAgo: 40,
  },
  {
    title: 'Slow shared drive',
    description: 'Opening files from the shared drive takes over a minute.',
    category: 'NETWORK',
    priority: 'MEDIUM',
    status: 'CANCELLED',
    owner: 0,
    assignee: 3,
    hoursAgo: 18,
  },
  {
    title: 'Keyboard replacement',
    description: 'Several keys on the keyboard stopped working after a spill.',
    category: 'HARDWARE',
    priority: 'LOW',
    status: 'CANCELLED',
    owner: 1,
    hoursAgo: 5,
  },
];

export type SeedResult = { users: number; requestsCreated: number };

/** Upserts the demo users and returns them in declaration order. */
export async function seedUsers(prisma: PrismaClient) {
  const passwordHash = await hash(DEMO_PASSWORD, 10);
  const users = [];
  for (const user of USERS) {
    users.push(
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name, role: user.role },
        create: { ...user, passwordHash },
      }),
    );
  }
  return users;
}

// Idempotent: users are upserted; sample requests are only inserted into an empty table.
export async function seed(prisma: PrismaClient): Promise<SeedResult> {
  const users = await seedUsers(prisma);

  if ((await prisma.serviceRequest.count()) > 0) {
    return { users: users.length, requestsCreated: 0 };
  }

  const now = Date.now();
  for (const sample of SAMPLE_REQUESTS) {
    const owner = users[sample.owner];
    const createdAt = new Date(now - sample.hoursAgo * 3_600_000);
    const startedAt = new Date(createdAt.getTime() + 2_000);
    const finishedAt = new Date(startedAt.getTime() + 9_000);
    const cancelledByOwner = sample.status === RequestStatus.CANCELLED;

    await prisma.serviceRequest.create({
      data: {
        title: sample.title,
        description: sample.description,
        category: sample.category,
        priority: sample.priority,
        status: sample.status,
        progress: sample.status === RequestStatus.COMPLETED ? 100 : 58,
        attempts: 1,
        failureReason:
          sample.status === RequestStatus.FAILED
            ? 'Simulated processing error'
            : null,
        version: 3,
        createdById: owner.id,
        assignedToId:
          sample.assignee !== undefined ? users[sample.assignee].id : null,
        createdAt,
        startedAt,
        finishedAt,
        history: {
          create: [
            {
              fromStatus: null,
              toStatus: RequestStatus.QUEUED,
              changedById: owner.id,
              note: 'Request submitted',
              createdAt,
            },
            {
              fromStatus: RequestStatus.QUEUED,
              toStatus: RequestStatus.IN_PROGRESS,
              changedById: null,
              note: 'Processing started',
              createdAt: startedAt,
            },
            {
              fromStatus: RequestStatus.IN_PROGRESS,
              toStatus: sample.status,
              changedById: cancelledByOwner ? owner.id : null,
              note: cancelledByOwner
                ? 'Cancelled'
                : sample.status === RequestStatus.FAILED
                  ? 'Simulated processing error'
                  : 'Processing completed',
              createdAt: finishedAt,
            },
          ],
        },
      },
    });
  }

  return { users: users.length, requestsCreated: SAMPLE_REQUESTS.length };
}
