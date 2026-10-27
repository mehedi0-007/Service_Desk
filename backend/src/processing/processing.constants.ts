export const REQUEST_QUEUE = 'service-requests';
export const PROCESS_REQUEST_JOB = 'process-request';

export type ProcessRequestJobData = { requestId: string };

// One job per enqueue: the version makes ids unique across retries and idempotent if enqueue is repeated.
export const jobIdFor = (requestId: string, version: number): string =>
  `${requestId}-v${version}`;
