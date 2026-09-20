import type { DatabaseFaultDriver } from './index';

export function extractMetadata(args: any[]): { query: string; table?: string; labels: string[] } {
  let queryString = '';
  if (typeof args[0] === 'string') {
    queryString = args[0];
  } else if (args[0] && typeof args[0].text === 'string') {
    queryString = args[0].text;
  }
  
  const labels: string[] = [];
  const labelRegex = /\/\*\s*sibyl-label:\s*([a-zA-Z0-9_-]+)\s*\*\//g;
  let match;
  while ((match = labelRegex.exec(queryString)) !== null) {
    labels.push(match[1]);
  }
  
  let table: string | undefined;
  const tableRegex = /(?:FROM|INTO|UPDATE|JOIN)\s+([a-zA-Z0-9_]+)/i;
  const tableMatch = tableRegex.exec(queryString);
  if (tableMatch) {
    table = tableMatch[1];
  }
  
  return { query: queryString, table, labels };
}

export function wrapPgPool(pool: any, driver: DatabaseFaultDriver): any {
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'connect') {
        return async (...args: any[]) => {
          const client = await target.connect(...args);
          return wrapPgClient(client, driver);
        };
      }
      if (prop === 'query') {
        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          const hasCallback = typeof lastArg === 'function';
          
          // Pool.query doesn't keep transaction state well, but we pass null tracker
          if (!hasCallback) {
            return applyFaultToQueryPromise(target.query.bind(target), driver, args, null);
          } else {
            const cb = args.pop();
            applyFaultToQueryPromise(target.query.bind(target), driver, args, null)
              .then(res => cb(null, res))
              .catch(err => cb(err));
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapPgClient(client: any, driver: DatabaseFaultDriver) {
  let inTransaction = false;
  let statementsInTx = 0;
  
  const txTracker = {
    updateTxState: (queryStr: string) => {
      const upper = queryStr.trim().toUpperCase();
      if (upper.startsWith('BEGIN')) {
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

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: any[]) => {
          const lastArg = args[args.length - 1];
          const hasCallback = typeof lastArg === 'function';
          
          if (!hasCallback) {
            return applyFaultToQueryPromise(target.query.bind(target), driver, args, txTracker);
          } else {
            const cb = args.pop();
            applyFaultToQueryPromise(target.query.bind(target), driver, args, txTracker)
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
    const err = new Error('Query read timeout');
    (err as any).code = '57014'; // query_canceled
    throw err;
  }

  if (fault.type === 'CONNECTION_DROP') {
    const err = new Error('Connection terminated unexpectedly');
    (err as any).code = '08006'; // connection_failure
    throw err;
  }

  if (fault.type === 'DEADLOCK') {
    const err = new Error('deadlock detected');
    (err as any).code = '40P01'; 
    throw err;
  }

  if (fault.type === 'PARTIAL_COMMIT') {
    // Only fail if we are the SECOND modifying statement in a transaction
    // Statements: 0 = first query after BEGIN. 1 = second query.
    if (txState.inTransaction && txState.statementsInTx === 1) { 
      const err = new Error('Connection terminated unexpectedly during transaction');
      (err as any).code = '08006';
      throw err;
    }
    return originalQuery(...args);
  }

  return originalQuery(...args);
}
