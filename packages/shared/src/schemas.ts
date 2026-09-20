import { z } from 'zod';

export const FaultDomainSchema = z.enum([
  'HTTP',
  'DATABASE',
  'MESSAGE_QUEUE',
  'GRPC',
  'FILESYSTEM',
  'CLOCK',
  'PROCESS',
  'MEMORY',
  'CPU',
]);
export type FaultDomain = z.infer<typeof FaultDomainSchema>;

export const SimulationEnvironmentSchema = z.enum([
  'LOCAL_PROCESS',
  'DOCKER_CONTAINER',
  'K8S_POD',
]);
export type SimulationEnvironment = z.infer<typeof SimulationEnvironmentSchema>;

// --- Fault Types per Domain ---

export const HttpFaultTypeSchema = z.enum([
  'TIMEOUT',
  'CONNECTION_REFUSED',
  'HTTP_5XX',
  'HTTP_4XX',
  'SLOW_RESPONSE',
  'PARTIAL_RESPONSE',
  'DUPLICATE_RESPONSE',
  'DNS_FAILURE',
  'TLS_HANDSHAKE_FAILURE',
]);

export const DatabaseFaultTypeSchema = z.enum([
  'QUERY_TIMEOUT',
  'CONNECTION_DROP',
  'DEADLOCK',
  'SLOW_QUERY',
  'PARTIAL_COMMIT',
]);

export const MessageQueueFaultTypeSchema = z.enum([
  'MESSAGE_DELAY',
  'MESSAGE_DUPLICATE',
  'MESSAGE_LOSS',
  'OUT_OF_ORDER_DELIVERY',
  'CONSUMER_CRASH_MID_PROCESSING',
]);

export const GrpcFaultTypeSchema = z.enum([
  'DEADLINE_EXCEEDED',
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
]);

export const FilesystemFaultTypeSchema = z.enum([
  'DISK_FULL',
  'SLOW_IO',
  'PERMISSION_DENIED',
  'PARTIAL_WRITE',
]);

export const ClockFaultTypeSchema = z.enum([
  'CLOCK_SKEW',
  'TIME_JUMP',
]);

export const ProcessFaultTypeSchema = z.enum([
  'CRASH',
  'OOM_KILL',
  'SIGTERM_DURING_OPERATION',
]);

export const ResourceFaultTypeSchema = z.enum([
  'PRESSURE',
]);

// --- Fault Specs (Discriminated Union) ---

export const HttpFaultSpecSchema = z.object({
  domain: z.literal('HTTP'),
  type: HttpFaultTypeSchema,
  status: z.number().optional(), // For HTTP_5XX / 4XX
  delayMs: z.number().optional(), // For SLOW_RESPONSE
});

export const DatabaseFaultSpecSchema = z.object({
  domain: z.literal('DATABASE'),
  type: DatabaseFaultTypeSchema,
  delayMs: z.number().optional(),
});

export const MessageQueueFaultSpecSchema = z.object({
  domain: z.literal('MESSAGE_QUEUE'),
  type: MessageQueueFaultTypeSchema,
  delayMs: z.number().optional(),
});

export const GrpcFaultSpecSchema = z.object({
  domain: z.literal('GRPC'),
  type: GrpcFaultTypeSchema,
});

export const FilesystemFaultSpecSchema = z.object({
  domain: z.literal('FILESYSTEM'),
  type: FilesystemFaultTypeSchema,
  delayMs: z.number().optional(),
});

export const ClockFaultSpecSchema = z.object({
  domain: z.literal('CLOCK'),
  type: ClockFaultTypeSchema,
  offsetMs: z.number().optional(),
});

export const ProcessFaultSpecSchema = z.object({
  domain: z.literal('PROCESS'),
  type: ProcessFaultTypeSchema,
});

export const MemoryFaultSpecSchema = z.object({
  domain: z.literal('MEMORY'),
  type: ResourceFaultTypeSchema,
  percentage: z.number().min(0).max(100),
  durationMs: z.number().positive(),
});

export const CpuFaultSpecSchema = z.object({
  domain: z.literal('CPU'),
  type: ResourceFaultTypeSchema,
  percentage: z.number().min(0).max(100),
  durationMs: z.number().positive(),
});

export const FaultSpecSchema = z.discriminatedUnion('domain', [
  HttpFaultSpecSchema,
  DatabaseFaultSpecSchema,
  MessageQueueFaultSpecSchema,
  GrpcFaultSpecSchema,
  FilesystemFaultSpecSchema,
  ClockFaultSpecSchema,
  ProcessFaultSpecSchema,
  MemoryFaultSpecSchema,
  CpuFaultSpecSchema,
]);

export type FaultSpec = z.infer<typeof FaultSpecSchema>;

// --- Schedules & Runs ---

export const FaultScheduleSchema = z.object({
  id: z.string().uuid(),
  spec: FaultSpecSchema,
  probability: z.number().min(0).max(1).default(1),
  startTime: z.number().optional(), // Epoch ms
  endTime: z.number().optional(), // Epoch ms
  target: z.record(z.string(), z.any()).optional(), // specific targets, e.g. { "service": "cart" }
});

export type FaultSchedule = z.infer<typeof FaultScheduleSchema>;

export const SimulationRunSchema = z.object({
  id: z.string().uuid(),
  environment: SimulationEnvironmentSchema,
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  schedules: z.array(FaultScheduleSchema),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

export type SimulationRun = z.infer<typeof SimulationRunSchema>;

// --- Promises (Hypotheses) ---

export const PromiseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  metric: z.string(), // e.g., 'latency_p99', 'error_rate'
  operator: z.enum(['<', '<=', '>', '>=', '==', '!=']),
  threshold: z.number(),
});

export type Promise = z.infer<typeof PromiseSchema>;

export const PromiseResultSchema = z.object({
  promiseId: z.string().uuid(),
  simulationRunId: z.string().uuid(),
  passed: z.boolean(),
  actualValue: z.number(),
  evaluatedAt: z.number(),
});

export type PromiseResult = z.infer<typeof PromiseResultSchema>;

// --- Captured Events (Telemetry) ---
// Extensibility Note: If we add a 10th domain later, older consumers of this data
// might fail validation if we use a strict discriminated union. 
// However, by wrapping it in a catch-all union or defining a 'Generic' fallback,
// we could achieve full forward-compatibility. For now, strict validation guarantees schema integrity,
// and systems should update their shared packages to parse new domains.

export const HttpEventPayloadSchema = z.object({
  method: z.string(),
  url: z.string(),
  statusCode: z.number(),
  durationMs: z.number(),
});

export const DatabaseEventPayloadSchema = z.object({
  query: z.string(),
  durationMs: z.number(),
});

export const MessageQueueEventPayloadSchema = z.object({
  topic: z.string(),
  messageId: z.string(),
});

export const GrpcEventPayloadSchema = z.object({
  method: z.string(),
  statusCode: z.number(),
});

export const FilesystemEventPayloadSchema = z.object({
  path: z.string(),
  operation: z.enum(['READ', 'WRITE', 'STAT', 'DELETE']),
});

export const ClockEventPayloadSchema = z.object({
  originalTime: z.number(),
  skewedTime: z.number(),
});

export const ProcessEventPayloadSchema = z.object({
  pid: z.number(),
  signal: z.string().optional(),
});

export const ResourceEventPayloadSchema = z.object({
  utilization: z.number(),
});

export const CapturedEventSchema = z.discriminatedUnion('domain', [
  z.object({ domain: z.literal('HTTP'), timestamp: z.number(), payload: HttpEventPayloadSchema }),
  z.object({ domain: z.literal('DATABASE'), timestamp: z.number(), payload: DatabaseEventPayloadSchema }),
  z.object({ domain: z.literal('MESSAGE_QUEUE'), timestamp: z.number(), payload: MessageQueueEventPayloadSchema }),
  z.object({ domain: z.literal('GRPC'), timestamp: z.number(), payload: GrpcEventPayloadSchema }),
  z.object({ domain: z.literal('FILESYSTEM'), timestamp: z.number(), payload: FilesystemEventPayloadSchema }),
  z.object({ domain: z.literal('CLOCK'), timestamp: z.number(), payload: ClockEventPayloadSchema }),
  z.object({ domain: z.literal('PROCESS'), timestamp: z.number(), payload: ProcessEventPayloadSchema }),
  z.object({ domain: z.literal('MEMORY'), timestamp: z.number(), payload: ResourceEventPayloadSchema }),
  z.object({ domain: z.literal('CPU'), timestamp: z.number(), payload: ResourceEventPayloadSchema }),
]);

export type CapturedEvent = z.infer<typeof CapturedEventSchema>;
