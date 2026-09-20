type TimerId = number;

/** 'realtime' is accepted as an alias: SearchConfig.clockOptions has always spelled it that way. */
export type ClockMode = 'real-time' | 'realtime' | 'accelerated';

export interface ClockOptions {
  mode: ClockMode;
  startTime?: number; // Initial virtual time in epoch ms
  /** Initial CLOCK_SKEW, as if applyFault had been called straight after install. */
  skewMs?: number;
  /**
   * Accelerated mode only. When true, virtual time jumps to the next pending timer whenever the
   * event loop turns over, so a workflow that awaits `setTimeout` completes without anyone calling
   * advance(). Off by default so tests can step the clock by hand.
   */
  autoAdvance?: boolean;
}

export type ClockFault =
  | { type: 'CLOCK_SKEW'; offsetMs: number }
  | { type: 'TIME_JUMP'; offsetMs: number };

interface TimerTask {
  id: TimerId;
  callback: Function;
  triggerTime: number; // Virtual time when this should fire
  isInterval: boolean;
  delay: number;
  args: any[];
  seq: number; // Insertion order, so equal trigger times fire FIFO like Node does
  nativeId?: ReturnType<typeof setTimeout>;
}

// Natives are captured once, at module load, before any clock can be installed. Capturing them per
// instance meant a clock constructed while another was installed saved the *fake* as "native" and
// restored it on uninstall, leaving the process's timers hijacked for good.
const NATIVE = {
  Date: globalThis.Date,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
};

/** The native Date constructor, unaffected by any installed clock. */
export const NativeDate: DateConstructor = NATIVE.Date;
/** Wall-clock milliseconds, unaffected by any installed clock. */
export const nativeNow = (): number => NATIVE.Date.now();
/** Real timers for engine bookkeeping (run timeouts) that must never be routed to a virtual clock. */
export const nativeSetTimeout = NATIVE.setTimeout;
export const nativeClearTimeout = NATIVE.clearTimeout;

/**
 * Timer handle returned by the fake setTimeout/setInterval. Mirrors the parts of Node's Timeout that
 * libraries actually call — undici (global fetch) calls refresh(), which the previous plain object
 * lacked, so installing the clock broke fetch.
 */
class VirtualTimerHandle {
  constructor(private clock: VirtualClock, public readonly id: TimerId, private native?: any) {}
  ref() { this.native?.ref?.(); return this; }
  unref() { this.native?.unref?.(); return this; }
  hasRef() { return this.native?.hasRef ? this.native.hasRef() : true; }
  refresh() { this.clock.refreshTimer(this.id); return this; }
  close() { this.clock.clearTimer(this.id); return this; }
  [Symbol.toPrimitive]() { return this.id; }
  [Symbol.dispose]() { this.close(); }
}

let installCount = 0;
let primaryClock: VirtualClock | null = null;
let contextResolver: (() => VirtualClock | undefined) | null = null;

/** The clock that a patched global call should act on right now. */
function activeClock(): VirtualClock | null {
  if (contextResolver) {
    // Inside a run's async context: that run's clock. Outside every run (orchestrator
    // bookkeeping, promise evaluation timestamps): real time, not some other run's clock.
    // A continuation that outlives its run (the clock is already uninstalled) gets real time too.
    const clock = contextResolver();
    return clock && clock.isInstalled() ? clock : null;
  }
  return primaryClock;
}

function patchGlobals() {
  const FakeDate = function (this: unknown, ...args: any[]) {
    const clock = activeClock();
    const now = clock ? clock.getVirtualTime() : NATIVE.Date.now();
    if (!new.target) {
      // Date() called as a function returns a string, and ignores its arguments.
      return new NATIVE.Date(now).toString();
    }
    return args.length === 0 ? new NATIVE.Date(now) : new (NATIVE.Date as any)(...args);
  } as unknown as DateConstructor;
  (FakeDate as any).prototype = NATIVE.Date.prototype; // keeps `instanceof Date` true in both directions
  (FakeDate as any).now = () => {
    const clock = activeClock();
    return clock ? clock.getVirtualTime() : NATIVE.Date.now();
  };
  (FakeDate as any).parse = NATIVE.Date.parse;
  (FakeDate as any).UTC = NATIVE.Date.UTC;

  globalThis.Date = FakeDate;
  globalThis.setTimeout = ((cb: Function, delay?: number, ...args: any[]) => {
    const clock = activeClock();
    return clock ? clock.scheduleTimer(cb, delay, args, false) : (NATIVE.setTimeout as any)(cb, delay, ...args);
  }) as any;
  globalThis.setInterval = ((cb: Function, delay?: number, ...args: any[]) => {
    const clock = activeClock();
    return clock ? clock.scheduleTimer(cb, delay, args, true) : (NATIVE.setInterval as any)(cb, delay, ...args);
  }) as any;
  const clear = (handle: any) => {
    if (handle instanceof VirtualTimerHandle) {
      (handle as any).clock.clearTimer(handle.id);
      return;
    }
    if (typeof handle === 'number') {
      // A numeric id could belong to any installed clock; ask the active one first.
      const clock = activeClock();
      if (clock && clock.clearTimer(handle)) return;
    }
    NATIVE.clearTimeout(handle);
  };
  globalThis.clearTimeout = clear as any;
  globalThis.clearInterval = clear as any;
}

function restoreGlobals() {
  globalThis.Date = NATIVE.Date;
  globalThis.setTimeout = NATIVE.setTimeout;
  globalThis.clearTimeout = NATIVE.clearTimeout;
  globalThis.setInterval = NATIVE.setInterval;
  globalThis.clearInterval = NATIVE.clearInterval;
}

export class VirtualClock {
  private mode: 'real-time' | 'accelerated' = 'accelerated';
  private now = 0; // Accelerated mode: the virtual time itself
  private baseVirtual = 0; // Real-time mode: virtual time at install...
  private baseReal = 0; // ...and the wall-clock time it corresponds to
  private jumpOffset = 0; // Real-time mode: accumulated TIME_JUMPs
  private skewOffset = 0; // CLOCK_SKEW, both modes

  private nextTimerId: TimerId = 1;
  private seq = 0;
  private queue: TimerTask[] = [];
  private autoAdvance = false;
  private pumpScheduled = false;

  private installed = false;

  /**
   * Routes patched globals to the clock of the current async context (one per concurrent run).
   * Set by the orchestrator; when unset, the first installed clock receives every call.
   */
  static setContextResolver(resolver: (() => VirtualClock | undefined) | null) {
    contextResolver = resolver;
  }

  public install(options: ClockOptions = { mode: 'accelerated' }) {
    if (this.installed) return;

    this.mode = options.mode === 'accelerated' ? 'accelerated' : 'real-time';
    const start = options.startTime ?? NATIVE.Date.now();
    this.now = start;
    this.baseVirtual = start;
    this.baseReal = NATIVE.Date.now();
    this.jumpOffset = 0;
    this.skewOffset = options.skewMs ?? 0;
    this.queue = [];
    this.nextTimerId = 1;
    this.autoAdvance = this.mode === 'accelerated' && !!options.autoAdvance;

    if (installCount === 0) patchGlobals();
    installCount++;
    if (!primaryClock) primaryClock = this;

    this.installed = true;
  }

  public uninstall() {
    if (!this.installed) return;

    for (const task of this.queue) {
      if (task.nativeId !== undefined) {
        task.isInterval ? NATIVE.clearInterval(task.nativeId) : NATIVE.clearTimeout(task.nativeId);
      }
    }
    this.queue = [];

    installCount--;
    if (primaryClock === this) primaryClock = null;
    if (installCount === 0) restoreGlobals();

    this.installed = false;
  }

  public isInstalled(): boolean {
    return this.installed;
  }

  public getVirtualTime(): number {
    if (this.mode === 'accelerated') return this.now + this.skewOffset;
    return this.baseVirtual + (NATIVE.Date.now() - this.baseReal) + this.jumpOffset + this.skewOffset;
  }

  public applyFault(fault: ClockFault) {
    if (fault.type === 'CLOCK_SKEW') {
      this.skewOffset = fault.offsetMs;
    } else if (fault.type === 'TIME_JUMP') {
      this.advance(fault.offsetMs);
    }
  }

  public advance(ms: number) {
    if (this.mode === 'real-time') {
      // Native timers fire on their own schedule; a jump only moves what the program reads.
      this.jumpOffset += ms;
      return;
    }

    if (ms < 0) {
      // Time jump backwards just changes the clock, it doesn't un-trigger timers
      this.now += ms;
      return;
    }

    const targetTime = this.now + ms;
    while (this.queue.length > 0) {
      const earliest = this.peekEarliest();
      if (earliest.triggerTime > targetTime) break;
      this.fire(earliest);
    }
    this.now = targetTime;
  }

  public runAll() {
    let maxIterations = 10000;
    while (this.queue.length > 0 && maxIterations > 0) {
      this.fire(this.peekEarliest());
      maxIterations--;
    }
    if (maxIterations === 0 && this.queue.length > 0) {
      throw new Error('VirtualClock: runAll() hit max iterations. Do you have an un-cleared setInterval?');
    }
  }

  public async runAllAsync() {
    let maxIterations = 10000;
    while (this.queue.length > 0 && maxIterations > 0) {
      this.fire(this.peekEarliest());
      await new Promise(r => NATIVE.setImmediate(r));
      maxIterations--;
    }
    if (maxIterations === 0 && this.queue.length > 0) {
      throw new Error('VirtualClock: runAllAsync() hit max iterations. Do you have an un-cleared setInterval?');
    }
  }

  /** Number of timers still pending on this clock. */
  public pendingTimers(): number {
    return this.queue.length;
  }

  /** @internal Called by the patched globals. */
  scheduleTimer(callback: Function, delay: number | undefined, args: any[], isInterval: boolean): VirtualTimerHandle {
    const id = this.nextTimerId++;
    const safeDelay = Math.max(0, Number(delay) || 0);
    const task: TimerTask = {
      id,
      callback,
      triggerTime: this.now + safeDelay,
      isInterval,
      delay: safeDelay,
      args,
      seq: this.seq++,
    };

    if (this.mode === 'real-time') {
      if (isInterval) {
        task.nativeId = NATIVE.setInterval(() => callback(...args), safeDelay);
      } else {
        task.nativeId = NATIVE.setTimeout(() => {
          this.removeTask(id);
          callback(...args);
        }, safeDelay);
      }
    }

    this.queue.push(task);
    if (this.autoAdvance) this.schedulePump();
    return new VirtualTimerHandle(this, id, task.nativeId);
  }

  /** @internal Returns true if the id belonged to this clock. */
  clearTimer(id: TimerId): boolean {
    const task = this.queue.find(t => t.id === id);
    if (!task) return false;
    if (task.nativeId !== undefined) {
      task.isInterval ? NATIVE.clearInterval(task.nativeId) : NATIVE.clearTimeout(task.nativeId);
    }
    this.removeTask(id);
    return true;
  }

  /** @internal Timeout.refresh(): restart the countdown with the original delay. */
  refreshTimer(id: TimerId) {
    const task = this.queue.find(t => t.id === id);
    if (!task) return;
    if (this.mode === 'real-time') {
      (task.nativeId as any)?.refresh?.();
    } else {
      task.triggerTime = this.now + task.delay;
      task.seq = this.seq++;
    }
  }

  private removeTask(id: TimerId) {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx !== -1) this.queue.splice(idx, 1);
  }

  private peekEarliest(): TimerTask {
    let earliest = this.queue[0];
    for (const t of this.queue) {
      if (t.triggerTime < earliest.triggerTime || (t.triggerTime === earliest.triggerTime && t.seq < earliest.seq)) {
        earliest = t;
      }
    }
    return earliest;
  }

  private fire(task: TimerTask) {
    this.removeTask(task.id);
    if (task.triggerTime > this.now) this.now = task.triggerTime;

    if (task.isInterval) {
      // Re-queue before the callback so clearInterval inside the callback can find it.
      task.triggerTime = this.now + Math.max(1, task.delay);
      task.seq = this.seq++;
      this.queue.push(task);
    }

    try {
      task.callback(...task.args);
    } catch (e) {
      console.error('Error in virtual timer callback:', e);
    }
  }

  private schedulePump() {
    if (this.pumpScheduled || !this.installed) return;
    this.pumpScheduled = true;
    // setImmediate runs after the current macrotask and its microtasks, so pending promise
    // continuations get to schedule their own timers before time moves.
    NATIVE.setImmediate(() => {
      this.pumpScheduled = false;
      if (!this.installed || this.queue.length === 0) return;
      this.fire(this.peekEarliest());
      if (this.queue.length > 0) this.schedulePump();
    });
  }
}
