import type { DatabaseFaultDriver } from './index';

export function extractMetadata(args: any[]): { query: string; table?: string; labels: string[] } {
  let queryString = '';
  if (typeof args[0] === 'string') {
    queryString = args[0];
  } else if (args[0] && typeof args[0].text === 'string') {
    queryString = args[0].text; // pg QueryConfig
  } else if (args[0] && typeof args[0].sql === 'string') {
    queryString = args[0].sql; // mysql2 QueryOptions
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

export interface TxState {
  inTransaction: boolean;
  /** Statements that already ran in the current transaction: 0 for the first statement after BEGIN. */
  statementsInTx: number;
}

export interface TxTracker {
  updateTxState(queryStr: string): TxState;
}

export function createTxTracker(): TxTracker {
  let inTransaction = false;
  let statementsInTx = 0;

  return {
    updateTxState(queryStr: string) {
      // Leading comments (e.g. sibyl-label) must not hide a BEGIN/COMMIT.
      const upper = queryStr.replace(/^\s*(\/\*[\s\S]*?\*\/\s*)*/, '').toUpperCase();
      if (upper.startsWith('BEGIN') || upper.startsWith('START TRANSACTION')) {
        inTransaction = true;
        statementsInTx = 0;
        return { inTransaction, statementsInTx };
      }
      if (upper.startsWith('COMMIT') || upper.startsWith('END') || (upper.startsWith('ROLLBACK') && !/^ROLLBACK\s+TO\b/.test(upper))) {
        inTransaction = false;
        statementsInTx = 0;
        return { inTransaction, statementsInTx };
      }
      if (!inTransaction) return { inTransaction, statementsInTx: 0 };
      // Report the count *before* this statement, so the first statement after BEGIN is 0.
      return { inTransaction, statementsInTx: statementsInTx++ };
    }
  };
}

export interface DialectErrors {
  queryTimeout(): Error;
  connectionDrop(): Error;
  deadlock(): Error;
  partialCommit(): Error;
}

/**
 * Runs `invoke(args)` with any scheduled DATABASE fault applied, for both promise-style calls and
 * callback-style calls (trailing function argument). Without a fault the call goes straight through
 * and its return value is preserved (a Promise, a pg Submittable, a mysql2 Query emitter...).
 */
export function interceptQuery(
  driver: DatabaseFaultDriver,
  dialect: DialectErrors,
  invoke: (args: any[]) => any,
  args: any[],
  txTracker: TxTracker | null
): any {
  const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
  const metadata = extractMetadata(callback ? args.slice(0, -1) : args);
  // Track transactions even while uninstalled, so a driver installed mid-transaction sees the right state.
  const txState = txTracker ? txTracker.updateTxState(metadata.query) : { inTransaction: false, statementsInTx: 0 };

  const context = driver.context;
  if (!context) return invoke(args);

  const fault = context.getFaultDecision('DATABASE', { ...metadata, ...txState });
  if (!fault) return invoke(args);

  // PARTIAL_COMMIT lets the first statement of a transaction succeed and breaks the connection on the
  // second, leaving the application with a half-applied transaction to recover from.
  if (fault.type === 'PARTIAL_COMMIT' && !(txState.inTransaction && txState.statementsInTx === 1)) {
    return invoke(args);
  }

  context.recordEvent({
    domain: 'DATABASE',
    payload: {
      query: metadata.query,
      durationMs: 0
    }
  } as any);

  const result = injectFault(fault, dialect).then(() => invoke(args));
  if (!callback) return result;

  // On success the real driver invokes the callback itself; only injected or synchronous errors land here.
  result.catch(err => callback(err));
  return undefined;
}

async function injectFault(fault: { type: string; delayMs?: number }, dialect: DialectErrors): Promise<void> {
  const delay = fault.delayMs || 5000;

  switch (fault.type) {
    case 'SLOW_QUERY':
      await new Promise(resolve => setTimeout(resolve, delay));
      return;
    case 'QUERY_TIMEOUT':
      await new Promise(resolve => setTimeout(resolve, delay));
      throw dialect.queryTimeout();
    case 'CONNECTION_DROP':
      throw dialect.connectionDrop();
    case 'DEADLOCK':
      throw dialect.deadlock();
    case 'PARTIAL_COMMIT':
      throw dialect.partialCommit();
  }
}
