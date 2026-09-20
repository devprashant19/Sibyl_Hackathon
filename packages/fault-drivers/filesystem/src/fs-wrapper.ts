import type { FilesystemFaultDriver } from './index';

type FsOperation = 'READ' | 'WRITE' | 'STAT' | 'DELETE';

// Only these calls are intercepted. Everything else on the module (Stats, ReadStream, Dirent, constants,
// watch/watchFile, close...) is handed back untouched so classes, instanceof and iterators keep working.
// `open` is classified per call from its flags.
const OPERATIONS = new Map<string, FsOperation>([
  ...(['readFile', 'read', 'readv', 'readdir', 'readlink', 'realpath', 'opendir', 'createReadStream'] as const)
    .map(name => [name, 'READ'] as const),
  ...(['stat', 'lstat', 'fstat', 'statfs', 'access'] as const)
    .map(name => [name, 'STAT'] as const),
  ...([
    'writeFile', 'appendFile', 'write', 'writev', 'createWriteStream', 'mkdir', 'mkdtemp', 'rename', 'copyFile', 'cp',
    'truncate', 'ftruncate', 'fsync', 'fdatasync', 'link', 'symlink',
    'chmod', 'lchmod', 'fchmod', 'chown', 'lchown', 'fchown', 'utimes', 'lutimes', 'futimes',
  ] as const).map(name => [name, 'WRITE'] as const),
  ...(['unlink', 'rm', 'rmdir'] as const)
    .map(name => [name, 'DELETE'] as const),
]);

// (path, data) calls where PARTIAL_WRITE can write half the data; fd-based writes take offsets we can't safely halve.
const TEARABLE = new Set(['writeFile', 'appendFile']);

function classify(name: string, args: any[], constants: any): FsOperation | undefined {
  if (name === 'open') return isWriteOpen(args[1], constants) ? 'WRITE' : 'READ';
  return OPERATIONS.get(name);
}

function isWriteOpen(flags: unknown, constants: any = {}): boolean {
  if (typeof flags === 'string') return /[wa+]/.test(flags);
  if (typeof flags === 'number') {
    const writeBits = (constants.O_WRONLY ?? 1) | (constants.O_RDWR ?? 2) | (constants.O_CREAT ?? 0) |
      (constants.O_APPEND ?? 0) | (constants.O_TRUNC ?? 0);
    return (flags & writeBits) !== 0;
  }
  return false;
}

function isIntercepted(name: string) {
  return name === 'open' || OPERATIONS.has(name);
}

function pathOf(arg: unknown): string {
  return arg === undefined ? 'unknown' : String(arg);
}

function createMockError(code: string, errno: number, syscall: string, path?: string) {
  const err = new Error(`${code}: ${syscall} failed`);
  (err as any).code = code;
  (err as any).errno = errno;
  (err as any).syscall = syscall;
  if (path) (err as any).path = path;
  return err;
}

function faultError(faultType: string, syscall: string, path: string): Error | null {
  if (faultType === 'PERMISSION_DENIED') return createMockError('EACCES', -13, syscall, path);
  if (faultType === 'DISK_FULL') return createMockError('ENOSPC', -28, syscall, path);
  return null;
}

function halve(data: any) {
  const half = Math.max(1, Math.floor(data.length / 2));
  return typeof data === 'string' ? data.slice(0, half) : data.subarray(0, half);
}

/** Looks up (and records) the fault for one call, or returns null to let it pass through. */
function decide(driver: FilesystemFaultDriver, path: string, operation: FsOperation) {
  const context = driver.context;
  if (!context) return null;
  const fault = context.getFaultDecision('FILESYSTEM', { path, operation });
  if (!fault) return null;
  context.recordEvent({
    domain: 'FILESYSTEM',
    payload: { path, operation }
  } as any);
  return fault as { type: string; delayMs?: number };
}

function copyFunctionProps<T extends Function>(wrapper: T, original: Function): T {
  // e.g. fs.realpath.native
  return Object.assign(wrapper, original);
}

export function wrapFsPromises(fsPromisesModule: any, driver: FilesystemFaultDriver): any {
  const wrappers = new Map<string, Function>();

  return new Proxy(fsPromisesModule, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || typeof original !== 'function' || !isIntercepted(prop)) return original;

      let wrapper = wrappers.get(prop);
      if (!wrapper) {
        wrapper = copyFunctionProps(async (...args: any[]) => {
          const operation = classify(prop, args, target.constants);
          const path = pathOf(args[0]);
          const fault = operation && decide(driver, path, operation);
          if (!fault) return original.apply(target, args);

          if (fault.type === 'SLOW_IO') {
            const delayMs = fault.delayMs || 5000;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }

          const err = faultError(fault.type, prop, path);
          if (err) throw err;

          if (fault.type === 'PARTIAL_WRITE' && TEARABLE.has(prop)) {
            const data = args[1];
            if (data && data.length > 0) {
              await original.apply(target, [args[0], halve(data), ...args.slice(2)]);
              throw createMockError('ENOSPC', -28, prop, path);
            }
          }

          return original.apply(target, args);
        }, original);
        wrappers.set(prop, wrapper);
      }
      return wrapper;
    }
  });
}

export function wrapFs(fsModule: any, driver: FilesystemFaultDriver): any {
  const wrappers = new Map<string, Function>();
  let promises: any;

  return new Proxy(fsModule, {
    get(target, prop, receiver) {
      if (prop === 'promises') {
        promises ??= wrapFsPromises(target.promises, driver);
        return promises;
      }

      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || typeof original !== 'function') return original;

      const isSync = prop.endsWith('Sync');
      const name = isSync ? prop.slice(0, -'Sync'.length) : prop;
      if (!isIntercepted(name)) return original;

      let wrapper = wrappers.get(prop);
      if (!wrapper) {
        wrapper = copyFunctionProps(
          name === 'createReadStream' || name === 'createWriteStream'
            ? wrapStreamFactory(target, original, name, driver)
            : wrapCallbackOrSync(target, original, name, isSync, driver),
          original
        );
        wrappers.set(prop, wrapper);
      }
      return wrapper;
    }
  });
}

function wrapCallbackOrSync(target: any, original: Function, name: string, isSync: boolean, driver: FilesystemFaultDriver) {
  const syscall = isSync ? `${name}Sync` : name;

  return (...args: any[]) => {
    const operation = classify(name, args, target.constants);
    const path = pathOf(args[0]);
    const fault = operation && decide(driver, path, operation);
    if (!fault) return original.apply(target, args);

    const callback = !isSync && typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;

    const err = faultError(fault.type, syscall, path);
    if (err) {
      if (!callback) throw err;
      // Node never calls fs callbacks synchronously; neither should an injected failure.
      process.nextTick(callback, err);
      return;
    }

    if (fault.type === 'PARTIAL_WRITE' && TEARABLE.has(name)) {
      const data = args[1];
      if (data && data.length > 0) {
        const partialArgs = [args[0], halve(data), ...args.slice(2)];

        if (!callback) {
          original.apply(target, partialArgs);
          throw createMockError('ENOSPC', -28, syscall, path);
        }

        partialArgs[partialArgs.length - 1] = (writeErr: any) => {
          callback(writeErr || createMockError('ENOSPC', -28, syscall, path));
        };
        return original.apply(target, partialArgs);
      }
    }

    // A sync call can't be slowed without blocking the event loop, so SLOW_IO only delays callbacks.
    if (fault.type === 'SLOW_IO' && callback) {
      const delay = fault.delayMs || 5000;
      const delayedArgs = [...args];
      delayedArgs[delayedArgs.length - 1] = (...cbArgs: any[]) => {
        setTimeout(() => callback(...cbArgs), delay);
      };
      return original.apply(target, delayedArgs);
    }

    return original.apply(target, args);
  };
}

function wrapStreamFactory(target: any, original: Function, name: string, driver: FilesystemFaultDriver) {
  return (...args: any[]) => {
    const path = pathOf(args[0]);
    const fault = decide(driver, path, OPERATIONS.get(name)!);
    if (!fault) return original.apply(target, args);

    const err = faultError(fault.type, 'open', path);
    const delay = fault.type === 'SLOW_IO' ? fault.delayMs || 5000 : 0;
    const options = typeof args[1] === 'string' ? { encoding: args[1] } : { ...args[1] };
    // With a caller-supplied fd there is no open() to intercept.
    if ((!err && !delay) || options.fd !== undefined) return original.apply(target, args);

    // Streams open their file through options.fs. Failing or delaying that open surfaces the fault through
    // the stream's own 'error'/'open' events, the way a real EACCES would, without touching the file.
    const baseFs = options.fs ?? target;
    options.fs = {
      ...baseFs,
      open: (...openArgs: any[]) => {
        const cb = openArgs.pop();
        if (err) process.nextTick(cb, err);
        else setTimeout(() => baseFs.open(...openArgs, cb), delay);
      },
    };
    return original.call(target, args[0], options);
  };
}
