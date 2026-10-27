import type { ConnectionOptions } from 'bullmq';

// BullMQ takes ioredis options rather than a URL, so REDIS_URL is split into its parts.
export function redisConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers. API-side queue calls check the connection first
    // (RequestQueueService.assertConnected) so they fail fast while Redis is down.
    maxRetriesPerRequest: null,
  };
}
