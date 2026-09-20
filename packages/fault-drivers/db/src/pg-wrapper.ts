import type { DatabaseFaultDriver } from './index';
import { createTxTracker, interceptQuery, type DialectErrors } from './query-fault';

export { extractMetadata } from './query-fault';

function pgError(message: string, code: string) {
  const err = new Error(message);
  (err as any).code = code;
  return err;
}

const pgErrors: DialectErrors = {
  queryTimeout: () => pgError('Query read timeout', '57014'), // query_canceled
  connectionDrop: () => pgError('Connection terminated unexpectedly', '08006'), // connection_failure
  deadlock: () => pgError('deadlock detected', '40P01'),
  partialCommit: () => pgError('Connection terminated unexpectedly during transaction', '08006'),
};

export function wrapPgPool(pool: any, driver: DatabaseFaultDriver): any {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'connect') {
        return (...args: any[]) => {
          if (typeof args[args.length - 1] === 'function') {
            const cb = args.pop();
            return target.connect(...args, (err: any, client: any, release: any) => {
              cb(err, client ? wrapPgClient(client, driver) : client, release);
            });
          }
          return target.connect(...args).then((client: any) => wrapPgClient(client, driver));
        };
      }
      if (prop === 'query') {
        // Pool.query runs each statement on whichever client is free, so there is no transaction to track.
        return (...args: any[]) => interceptQuery(driver, pgErrors, a => target.query(...a), args, null);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapPgClient(client: any, driver: DatabaseFaultDriver) {
  const txTracker = createTxTracker();

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: any[]) => interceptQuery(driver, pgErrors, a => target.query(...a), args, txTracker);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
