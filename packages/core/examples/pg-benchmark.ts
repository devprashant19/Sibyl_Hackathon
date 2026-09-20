import { Client } from 'pg';
import Redis from 'ioredis';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

/**
 * Phase 9: Postgres Partitioning, Redis Caching, and S3 Offloading Benchmark.
 * 
 * To run this script:
 * 1. Ensure Postgres is running locally on port 5432 with a database named `sibyl_db`.
 * 2. Ensure Redis is running locally on port 6379.
 * 3. Run: ts-node packages/core/examples/pg-benchmark.ts
 */

const DB_CONFIG = {
  user: 'sibyl',
  host: 'localhost',
  database: 'sibyl_db',
  password: 'password',
  port: 5432,
};

async function runBenchmark() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  console.log('--- Setting up benchmark schemas ---');

  // 1. Create UNPARTITIONED table
  await client.query(`DROP TABLE IF EXISTS captured_events_unpartitioned CASCADE;`);
  await client.query(`
    CREATE TABLE captured_events_unpartitioned (
      id UUID PRIMARY KEY,
      run_id UUID NOT NULL,
      domain VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL,
      payload_s3_key VARCHAR(255) -- Payload moved to S3
    );
  `);

  // 2. Create PARTITIONED table
  await client.query(`DROP TABLE IF EXISTS captured_events_partitioned CASCADE;`);
  await client.query(`
    CREATE TABLE captured_events_partitioned (
      id UUID,
      run_id UUID NOT NULL,
      domain VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL,
      payload_s3_key VARCHAR(255)
    ) PARTITION BY RANGE (created_at);
  `);

  // Create monthly partitions for the year 2026
  for (let month = 1; month <= 12; month++) {
    const startStr = `2026-${month.toString().padStart(2, '0')}-01 00:00:00`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? 2027 : 2026;
    const endStr = `${endYear}-${endMonth.toString().padStart(2, '0')}-01 00:00:00`;
    
    await client.query(`
      CREATE TABLE captured_events_2026_${month.toString().padStart(2, '0')}
      PARTITION OF captured_events_partitioned
      FOR VALUES FROM ('${startStr}') TO ('${endStr}');
    `);
  }

  // Create indexes
  await client.query(`CREATE INDEX idx_unpart_created_at ON captured_events_unpartitioned(created_at);`);
  await client.query(`CREATE INDEX idx_part_created_at ON captured_events_partitioned(created_at);`);

  console.log('--- Synthesizing 10M rows... (This will take a moment) ---');
  // We use generate_series to insert 10M rows efficiently directly in Postgres
  // Distributing them across the entire 2026 year.
  
  const generateSql = (table: string) => `
    INSERT INTO ${table} (id, run_id, domain, created_at, payload_s3_key)
    SELECT 
      gen_random_uuid(),
      gen_random_uuid(),
      (ARRAY['HTTP', 'DATABASE', 'MESSAGE_QUEUE', 'GRPC'])[floor(random() * 4 + 1)],
      timestamp '2026-01-01 00:00:00' + random() * (timestamp '2026-12-31 23:59:59' - timestamp '2026-01-01 00:00:00'),
      's3://sibyl-payloads/2026/' || gen_random_uuid() || '.json'
    FROM generate_series(1, 10000000);
  `;

  console.log('Inserting 10M into UNPARTITIONED...');
  await client.query(generateSql('captured_events_unpartitioned'));
  
  console.log('Inserting 10M into PARTITIONED...');
  await client.query(generateSql('captured_events_partitioned'));

  console.log('--- Running Performance Benchmarks ---');

  // Query: Find all HTTP events in a specific week of August 2026
  const testQuery = (table: string) => `
    SELECT count(*) FROM ${table} 
    WHERE created_at >= '2026-08-15 00:00:00' 
      AND created_at < '2026-08-22 00:00:00'
      AND domain = 'HTTP';
  `;

  // Dry run to warm up caches
  await client.query(testQuery('captured_events_unpartitioned'));
  await client.query(testQuery('captured_events_partitioned'));

  // Benchmark Unpartitioned
  const startUnpart = Date.now();
  await client.query(testQuery('captured_events_unpartitioned'));
  const durationUnpart = Date.now() - startUnpart;
  console.log(`Unpartitioned Query took: ${durationUnpart}ms`);

  // Benchmark Partitioned
  const startPart = Date.now();
  await client.query(testQuery('captured_events_partitioned'));
  const durationPart = Date.now() - startPart;
  console.log(`Partitioned Query took: ${durationPart}ms`);
  
  console.log(`Speedup multiplier: ${(durationUnpart / durationPart).toFixed(2)}x`);

  // --- S3 & Redis Mock Showcase ---
  console.log('\n--- Redis Read-Through & S3 Offload Example ---');
  
  const redis = new Redis({ host: 'localhost', port: 6379, lazyConnect: true });
  const s3 = new S3Client({ 
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    credentials: { accessKeyId: 'sibyl-admin', secretAccessKey: 'sibyl-password' },
    forcePathStyle: true
  });

  const runId = crypto.randomUUID();
  const cacheKey = `run:${runId}`;

  try {
    // 1. Attempt Cache Read
    console.log(`Fetching run ${runId}...`);
    let runData = await redis.get(cacheKey).catch(() => null);
    
    if (runData) {
      console.log('Cache Hit!');
    } else {
      console.log('Cache Miss. Fetching from DB & S3...');
      
      // Simulate saving a heavy payload to S3 first
      const payloadObj = { massiveBody: "a".repeat(100000) };
      const s3Key = `${runId}/event-1.json`;
      
      // Upload to S3 (mock failure gracefully if minio is down)
      await s3.send(new PutObjectCommand({
        Bucket: 'sibyl-payloads',
        Key: s3Key,
        Body: JSON.stringify(payloadObj)
      })).catch(() => console.log('(MinIO not reachable, skipping physical upload)'));

      // Save metadata to postgres
      await client.query(`
        INSERT INTO captured_events_partitioned (id, run_id, domain, created_at, payload_s3_key)
        VALUES ($1, $2, 'HTTP', NOW(), $3)
      `, [crypto.randomUUID(), runId, `s3://sibyl-payloads/${s3Key}`]);

      // Cache it in Redis for next time
      const aggregatedData = {
        runId,
        events: [ { domain: 'HTTP', payloadS3Key: s3Key } ] // We don't cache the massive 10MB payload in Redis, just the metadata!
      };
      
      await redis.set(cacheKey, JSON.stringify(aggregatedData), 'EX', 86400).catch(() => console.log('(Redis not reachable, skipping cache write)'));
      console.log('Run aggregated and cached.');
    }
  } catch (err) {
    console.error('Cache/S3 example error:', err);
  } finally {
    redis.disconnect();
    await client.end();
  }
}

runBenchmark().catch(console.error);
