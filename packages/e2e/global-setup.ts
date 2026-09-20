import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';

export default async function globalSetup() {
  console.log('Starting Testcontainers (Postgres + Redis)...');

  const pg = await new PostgreSqlContainer().start();
  const redis = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .start();

  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  // Store references to shut them down later
  (global as any).__PG_CONTAINER__ = pg;
  (global as any).__REDIS_CONTAINER__ = redis;
}
