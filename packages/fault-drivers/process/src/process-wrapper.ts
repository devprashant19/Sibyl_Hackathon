import type { ProcessFaultDriver } from './index';

export function wrapChildProcess(cpModule: any, driver: ProcessFaultDriver): any {
  return new Proxy(cpModule, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      if (prop === 'spawn' || prop === 'exec' || prop === 'fork') {
        return (...args: any[]) => {
          if (!driver.context) return original.apply(target, args);

          const command = args[0] || 'unknown';
          const fault = driver.context.getFaultDecision('PROCESS', { command });
          
          const child = original.apply(target, args);

          if (!fault) return child;

          driver.context.recordEvent({
            domain: 'PROCESS',
            payload: { pid: child.pid || -1 }
          } as any);

          const faultAny = fault as any;

          if (fault.type === 'CRASH') {
            setTimeout(() => {
              child.kill('SIGKILL');
            }, 10);
          }

          if (fault.type === 'OOM_KILL') {
            setTimeout(() => {
              // SIGKILL results in code 137 or signal SIGKILL.
              child.kill('SIGKILL');
            }, 10);
          }

          if (fault.type === 'SIGTERM_DURING_OPERATION') {
            const delay = faultAny.delayMs || 50;
            setTimeout(() => {
              child.kill('SIGTERM');
            }, delay);
          }

          return child;
        };
      }
      return original;
    }
  });
}
