export type RunStatus = 'COMPLETED' | 'FAILED' | 'RUNNING';

export interface SimulationRun {
  id: string;
  status: RunStatus;
  timestamp: string;
  durationMs: number;
  environment: string;
}

export interface CapturedEvent {
  id: string;
  domain: string;
  type: string;
  timestamp: string;
  payload: any;
  isFault?: boolean; // Marks if this event was an injected fault
}

export const mockRuns: SimulationRun[] = [
  { id: 'run-9f3b1', status: 'FAILED', timestamp: '2026-08-30T10:23:45Z', durationMs: 4500, environment: 'DOCKER_CONTAINER' },
  { id: 'run-8c2a0', status: 'COMPLETED', timestamp: '2026-08-30T10:22:11Z', durationMs: 3100, environment: 'DOCKER_CONTAINER' },
  { id: 'run-7b1d9', status: 'COMPLETED', timestamp: '2026-08-30T10:20:05Z', durationMs: 2950, environment: 'DOCKER_CONTAINER' },
  { id: 'run-6a0e8', status: 'FAILED', timestamp: '2026-08-30T10:18:22Z', durationMs: 1200, environment: 'DOCKER_CONTAINER' },
  { id: 'run-5f9f7', status: 'COMPLETED', timestamp: '2026-08-30T10:15:10Z', durationMs: 3050, environment: 'DOCKER_CONTAINER' },
];

export const mockEvents: Record<string, CapturedEvent[]> = {
  'run-9f3b1': [
    { id: 'e1', domain: 'HTTP', type: 'REQUEST_START', timestamp: '2026-08-30T10:23:45.010Z', payload: { method: 'POST', url: '/api/checkout' } },
    { id: 'e2', domain: 'DATABASE', type: 'QUERY_START', timestamp: '2026-08-30T10:23:45.100Z', payload: { query: 'BEGIN TRANSACTION' } },
    { id: 'e3', domain: 'HTTP', type: 'TIMEOUT', timestamp: '2026-08-30T10:23:47.100Z', payload: { delayMs: 2000, target: '/api/payment' }, isFault: true },
    { id: 'e4', domain: 'DATABASE', type: 'QUERY_ERROR', timestamp: '2026-08-30T10:23:49.000Z', payload: { query: 'COMMIT', error: 'deadlock detected' } },
  ],
  'run-8c2a0': [
    { id: 'e1', domain: 'HTTP', type: 'REQUEST_START', timestamp: '2026-08-30T10:22:11.010Z', payload: { method: 'POST', url: '/api/checkout' } },
    { id: 'e2', domain: 'DATABASE', type: 'QUERY_START', timestamp: '2026-08-30T10:22:11.100Z', payload: { query: 'BEGIN TRANSACTION' } },
    { id: 'e3', domain: 'DATABASE', type: 'QUERY_END', timestamp: '2026-08-30T10:22:11.150Z', payload: { query: 'COMMIT' } },
  ]
};
