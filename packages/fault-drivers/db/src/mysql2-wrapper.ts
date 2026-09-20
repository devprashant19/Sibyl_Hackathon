import type { DatabaseFaultDriver } from './index';
import { extractMetadata } from './pg-wrapper';

export function wrapMysql2Pool(pool: any, driver: DatabaseFaultDriver): any {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'getConnection') {
        return async (...args: any[]) => {
          const conn = await target.getConnection(...args);
          return wrapMysql2Connection(conn, driver);
        };
      }
      if (prop === 'query' || prop === 'execute') {
        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          const hasCallback = typeof lastArg === 'function';
          
          if (!hasCallback) {
            return applyFaultToQueryPromise(target[prop].bind(target), driver, args, null);
          } else {
            const cb = args.pop();
            applyFaultToQueryPromise(target[prop].bind(target), driver, args, null)
              .then(res => cb(null, res))
              .catch(err => cb(err));
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapMysql2Connection(conn: any, driver: DatabaseFaultDriver) {
  let inTransaction = false;
  let statementsInTx = 0;
  
  const txTracker = {
    updateTxState: (queryStr: string) => {
      const upper = queryStr.trim().toUpperCase();
      if (upper.startsWith('START TRANSACTION') || upper.startsWith('BEGIN')) {
        inTransaction = true;
        statementsInTx = 0;
      } else if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
        inTransaction = false;
      } else if (inTransaction) {
        statementsInTx++;
      }
      return { inTransaction, statementsInTx };
    }
  };

  return new Proxy(conn, {
    get(target, prop, receiver) {
      if (prop === 'query' || prop === 'execute') {
        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          const hasCallback = typeof lastArg === 'function';
          
          if (!hasCallback) {
            return applyFaultToQueryPromise(target[prop].bind(target), driver, args, txTracker);
          } else {
            const cb = args.pop();
            applyFaultToQueryPromise(target[prop].bind(target), driver, args, txTracker)
              .then(res => cb(null, res))
              .catch(err => cb(err));
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

async function applyFaultToQueryPromise(originalQuery: Function, driver: DatabaseFaultDriver, args: any[], txTracker: any) {
  const metadata = extractMetadata(args);
  
  const txState = txTracker ? txTracker.updateTxState(metadata.query) : { inTransaction: false, statementsInTx: 0 };
  
  if (!driver.context) {
    return originalQuery(...args);
  }
  
  const fault = driver.context.getFaultDecision('DATABASE', {
    ...metadata,
    ...txState
  });
  
  if (!fault) {
    return originalQuery(...args);
  }

  driver.context.recordEvent({
    domain: 'DATABASE',
    payload: {
      query: metadata.query,
      durationMs: 0
    }
  } as any);

  const faultAny = fault as any;

  if (fault.type === 'SLOW_QUERY') {
    const delay = faultAny.delayMs || 5000;
    await new Promise(resolve => setTimeout(resolve, delay));
    return originalQuery(...args);
  }

  if (fault.type === 'QUERY_TIMEOUT') {
    const delay = faultAny.delayMs || 5000;
    await new Promise(resolve => setTimeout(resolve, delay));
    const err = new Error('Query execution was interrupted');
    (err as any).code = 'ER_QUERY_TIMEOUT';
    (err as any).errno = 1878;
    throw err;
  }

  if (fault.type === 'CONNECTION_DROP') {
    const err = new Error('read ECONNRESET');
    (err as any).code = 'ECONNRESET'; 
    (err as any).fatal = true;
    throw err;
  }

  if (fault.type === 'DEADLOCK') {
    const err = new Error('Deadlock found when trying to get lock; try restarting transaction');
    (err as any).code = 'ER_LOCK_DEADLOCK';
    (err as any).errno = 1213;
    throw err;
  }

  if (fault.type === 'PARTIAL_COMMIT') {
    if (txState.inTransaction && txState.statementsInTx === 1) { 
      const err = new Error('read ECONNRESET');
      (err as any).code = 'ECONNRESET';
      (err as any).fatal = true;
      throw err;
    }
    return originalQuery(...args);
  }

  return originalQuery(...args);
}
