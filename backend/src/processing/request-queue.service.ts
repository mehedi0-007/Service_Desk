import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  jobIdFor,
  PROCESS_REQUEST_JOB,
  ProcessRequestJobData,
  REQUEST_QUEUE,
} from './processing.constants';

@Injectable()
export class RequestQueueService {
  private readonly logger = new Logger(RequestQueueService.name);

  constructor(
    @InjectQueue(REQUEST_QUEUE)
    private readonly queue: Queue<ProcessRequestJobData>,
  ) {}

  async enqueue(requestId: string, version: number): Promise<string> {
    const jobId = jobIdFor(requestId, version);
    await this.queue.add(PROCESS_REQUEST_JOB, { requestId }, { jobId });
    return jobId;
  }

  async remove(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch (error) {
      // An active job cannot be removed; the worker sees the cancelled status and stops on its own.
      this.logger.debug(`Job ${jobId} not removed: ${String(error)}`);
    }
  }

  async exists(jobId: string): Promise<boolean> {
    return (await this.queue.getJob(jobId)) !== undefined;
  }

  async getCounts(): Promise<{ waiting: number; active: number }> {
    const counts = await this.queue.getJobCounts('waiting', 'active');
    return { waiting: counts.waiting ?? 0, active: counts.active ?? 0 };
  }

  // Resolves once the queue's Redis connection is ready; rejects after timeoutMs so health checks never hang.
  async assertConnected(timeoutMs = 1000): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Redis connection timed out')),
        timeoutMs,
      );
    });
    try {
      const client = await Promise.race([this.queue.client, timeout]);
      if (client.status !== 'ready') {
        throw new Error(`Redis connection is ${client.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
