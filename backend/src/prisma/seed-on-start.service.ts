import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { PrismaService } from './prisma.service';
import { seed } from './seed-data';

// Hosts without shell access (such as free cloud tiers) seed demo data on boot instead of via the CLI.
@Injectable()
export class SeedOnStartService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedOnStartService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.seedOnStart) {
      return;
    }
    const result = await seed(this.prisma);
    this.logger.log(
      `Seed complete: ${result.users} users, ${result.requestsCreated} sample requests created`,
    );
  }
}
