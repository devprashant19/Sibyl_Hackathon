export default async function globalTeardown() {
  console.log('Tearing down Testcontainers...');
  const pg = (global as any).__PG_CONTAINER__;
  const redis = (global as any).__REDIS_CONTAINER__;

  if (pg) await pg.stop();
  if (redis) await redis.stop();
}
