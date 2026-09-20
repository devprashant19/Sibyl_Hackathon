import { GetRunResponseSchema, IngestEventsRequestSchema } from './packages/shared/src/api-schemas';

console.log("GetRunResponseSchema.shape.run.shape.schedules.element.shape.spec:");
console.log(GetRunResponseSchema.shape.run.shape.schedules.element.shape.spec);

console.log("\nIngestEventsRequestSchema.shape.events.element.shape.payload:");
console.log(IngestEventsRequestSchema.shape.events.element.options[0].shape.payload);
