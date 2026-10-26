import { PrismaClient } from '@prisma/client';
import { seed } from '../src/prisma/seed-data';

const prisma = new PrismaClient();

seed(prisma)
  .then((result) => {
    console.log(
      `Seed complete: ${result.users} users, ${result.requestsCreated} sample requests created`,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
