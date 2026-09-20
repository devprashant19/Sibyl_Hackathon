import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  IngestEventsRequestSchema,
  ReportPromisesRequestSchema,
  GetRunResponseSchema
} from '@sibyl-shared';

const schemas: Record<string, any> = {
  IngestEventsRequest: IngestEventsRequestSchema,
  ReportPromisesRequest: ReportPromisesRequestSchema,
  GetRunResponse: GetRunResponseSchema,
};

describe('API Contract Tests', () => {
  const fixturesDir = path.join(__dirname, 'contracts', 'fixtures');

  if (!fs.existsSync(fixturesDir)) {
    console.warn('No contract fixtures found.');
    return;
  }

  const consumers = fs.readdirSync(fixturesDir);

  for (const consumer of consumers) {
    const consumerPath = path.join(fixturesDir, consumer);
    const versions = fs.readdirSync(consumerPath);

    describe(`Consumer: ${consumer}`, () => {
      for (const version of versions) {
        const versionPath = path.join(consumerPath, version);
        const files = fs.readdirSync(versionPath).filter(f => f.endsWith('.json'));

        describe(`Version: ${version}`, () => {
          for (const file of files) {
            const schemaName = file.replace('.json', '');

            it(`should validate ${schemaName} payload`, () => {
              const schema = schemas[schemaName];
              expect(schema).toBeDefined();

              const filePath = path.join(versionPath, file);
              const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

              const result = schema.safeParse(payload);
              
              if (!result.success) {
                console.error(`Validation failed for ${consumer}/${version}/${file}`);
                console.error(JSON.stringify(result.error.issues, null, 2));
              }
              
              expect(result.success).toBe(true);
            });
          }
        });
      }
    });
  }
});
