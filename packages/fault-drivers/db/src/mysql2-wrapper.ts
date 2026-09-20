import type { DatabaseFaultDriver } from './index';
import { createTxTracker, interceptQuery, type DialectErrors } from './query-fault';

function mysqlError(message: string, props: Record<string, unknown>) {
  return Object.assign(new Error(message), props);
}

const mysqlErrors: DialectErrors = {
  queryTimeout: () => mysqlError('Query execution was interrupted', { code: 'ER_QUERY_TIMEOUT', errno: 1878 }),
  connectionDrop: () => mysqlError('read ECONNRESET', { code: 'ECONNRESET', fatal: true }),
  deadlock: () => mysqlError('Deadlock found when trying to get lock; try restarting transaction', { code: 'ER_LOCK_DEADLOCK', errno: 1213 }),
  partialCommit: () => mysqlError('read ECONNRESET', { code: 'ECONNRESET', fatal: true }),
};

export function wrapMysql2Pool(pool: any, driver: DatabaseFaultDriver): any {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'getConnection') {
        return (...args: any[]) => {
          if (typeof args[args.length - 1] === 'function') {
            const cb = args.pop();
            return target.getConnection(...args, (err: any, conn: any) => {
              cb(err, conn ? wrapMysql2Connection(conn, driver) : conn);
            });
          }
          return target.getConnection(...args).then((conn: any) => wrapMysql2Connection(conn, driver));
        };
      }
      if (prop === 'query' || prop === 'execute') {
        return (...args: any[]) => interceptQuery(driver, mysqlErrors, a => target[prop](...a), args, null);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapMysql2Connection(conn: any, driver: DatabaseFaultDriver) {
  const txTracker = createTxTracker();

  return new Proxy(conn, {
    get(target, prop, receiver) {
      if (prop === 'query' || prop === 'execute') {
        return (...args: any[]) => interceptQuery(driver, mysqlErrors, a => target[prop](...a), args, txTracker);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
