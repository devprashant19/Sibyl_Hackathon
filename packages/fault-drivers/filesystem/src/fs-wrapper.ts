import type { FilesystemFaultDriver } from './index';
import * as util from 'util';

function createMockError(code: string, errno: number, syscall: string, path?: string) {
  const err = new Error(`${code}: ${syscall} failed`);
  (err as any).code = code;
  (err as any).errno = errno;
  (err as any).syscall = syscall;
  if (path) (err as any).path = path;
  return err;
}

export function wrapFsPromises(fsPromisesModule: any, driver: FilesystemFaultDriver): any {
  return new Proxy(fsPromisesModule, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      return async (...args: any[]) => {
        if (!driver.context) return original.apply(target, args);

        const path = args[0] ? String(args[0]) : 'unknown';
        const operation = (prop === 'readFile' || prop === 'stat') ? 'READ' :
                          (prop === 'writeFile' || prop === 'appendFile') ? 'WRITE' :
                          (prop === 'unlink') ? 'DELETE' : 'READ';

        const fault = driver.context.getFaultDecision('FILESYSTEM', { path, operation });
        
        if (fault) {
          driver.context.recordEvent({
            domain: 'FILESYSTEM',
            payload: { path, operation }
          } as any);

          if (fault.type === 'SLOW_IO') {
            const delayMs = (fault as any).delayMs || 5000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }

          if (fault.type === 'PERMISSION_DENIED') {
            throw createMockError('EACCES', -13, prop as string, path);
          }

          if (fault.type === 'DISK_FULL') {
            throw createMockError('ENOSPC', -28, prop as string, path);
          }

          if (fault.type === 'PARTIAL_WRITE' && operation === 'WRITE') {
            const data = args[1];
            if (data && data.length > 0) {
              const half = Math.max(1, Math.floor(data.length / 2));
              const partialData = typeof data === 'string' ? data.slice(0, half) : data.subarray(0, half);
              args[1] = partialData;
              await original.apply(target, args); // Write half
              throw createMockError('ENOSPC', -28, prop as string, path);
            }
          }
        }

        return original.apply(target, args);
      };
    }
  });
}

export function wrapFs(fsModule: any, driver: FilesystemFaultDriver): any {
  return new Proxy(fsModule, {
    get(target, prop, receiver) {
      if (prop === 'promises') {
        return wrapFsPromises(target.promises, driver);
      }

      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== 'function') return original;

      return (...args: any[]) => {
        if (!driver.context) return original.apply(target, args);

        const isSync = (prop as string).endsWith('Sync');
        const pathArg = args[0] ? String(args[0]) : 'unknown';
        const operation = ((prop as string).includes('read') || (prop as string).includes('stat')) ? 'READ' :
                          ((prop as string).includes('write') || (prop as string).includes('append')) ? 'WRITE' :
                          ((prop as string).includes('unlink')) ? 'DELETE' : 'READ';

        const fault = driver.context.getFaultDecision('FILESYSTEM', { path: pathArg, operation });

        if (!fault) return original.apply(target, args);

        driver.context.recordEvent({
          domain: 'FILESYSTEM',
          payload: { path: pathArg, operation }
        } as any);

        const hasCallback = typeof args[args.length - 1] === 'function';

        if (fault.type === 'PERMISSION_DENIED') {
          const err = createMockError('EACCES', -13, prop as string, pathArg);
          if (isSync) throw err;
          if (hasCallback) return args[args.length - 1](err);
        }

        if (fault.type === 'DISK_FULL') {
          const err = createMockError('ENOSPC', -28, prop as string, pathArg);
          if (isSync) throw err;
          if (hasCallback) return args[args.length - 1](err);
        }

        if (fault.type === 'PARTIAL_WRITE' && operation === 'WRITE') {
          const dataArgIdx = 1;
          const data = args[dataArgIdx];
          if (data && data.length > 0) {
            const half = Math.max(1, Math.floor(data.length / 2));
            const partialData = typeof data === 'string' ? data.slice(0, half) : data.subarray(0, half);
            args[dataArgIdx] = partialData;

            if (isSync) {
              original.apply(target, args); // write partial
              throw createMockError('ENOSPC', -28, prop as string, pathArg);
            }

            if (hasCallback) {
              const originalCb = args.pop();
              args.push((err: any) => {
                if (err) return originalCb(err);
                originalCb(createMockError('ENOSPC', -28, prop as string, pathArg));
              });
              return original.apply(target, args);
            }
          }
        }

        if (fault.type === 'SLOW_IO') {
           // We can't really slow down a sync call realistically without blocking the event loop (which we shouldn't do).
           // For async calls, we could wrap the callback in a setTimeout.
           if (!isSync && hasCallback) {
             const delay = (fault as any).delayMs || 5000;
             const originalCb = args.pop();
             args.push((...cbArgs: any[]) => {
                setTimeout(() => originalCb(...cbArgs), delay);
             });
           }
        }

        return original.apply(target, args);
      };
    }
  });
}
