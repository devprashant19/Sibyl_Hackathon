type TimerId = number;

export type ClockMode = 'real-time' | 'accelerated';

export interface ClockOptions {
  mode: ClockMode;
  startTime?: number; // Initial virtual time in epoch ms
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
  nativeId?: ReturnType<typeof setTimeout>;
}

export class VirtualClock {
  private mode: ClockMode = 'accelerated';
  private now: number = 0; // Virtual time
  private skewOffset: number = 0; // For CLOCK_SKEW faults

  private nextTimerId: TimerId = 1;
  private queue: TimerTask[] = [];

  // Native references
  private nativeSetTimeout: typeof setTimeout = setTimeout;
  private nativeClearTimeout: typeof clearTimeout = clearTimeout;
  private nativeSetInterval: typeof setInterval = setInterval;
  private nativeClearInterval: typeof clearInterval = clearInterval;
  private NativeDate: typeof Date = Date;
  
  private installed = false;

  constructor() {}

  public install(options: ClockOptions = { mode: 'accelerated' }) {
    if (this.installed) return;
    
    this.mode = options.mode;
    this.now = options.startTime ?? this.NativeDate.now();
    this.skewOffset = 0;
    this.queue = [];
    this.nextTimerId = 1;

    // Patch Date
    const FakeDate = this.createFakeDate();
    global.Date = FakeDate as any;

    // Patch Timers
    global.setTimeout = this.fakeSetTimeout as any;
    global.clearTimeout = this.fakeClearTimeout as any;
    global.setInterval = this.fakeSetInterval as any;
    global.clearInterval = this.fakeClearInterval as any;

    this.installed = true;
  }

  public uninstall() {
    if (!this.installed) return;

    global.Date = this.NativeDate;
    global.setTimeout = this.nativeSetTimeout as any;
    global.clearTimeout = this.nativeClearTimeout as any;
    global.setInterval = this.nativeSetInterval as any;
    global.clearInterval = this.nativeClearInterval as any;
    
    this.queue.forEach(task => {
      if (task.nativeId) {
        this.nativeClearTimeout(task.nativeId);
      }
    });

    this.installed = false;
  }

  public getVirtualTime(): number {
    return this.now + this.skewOffset;
  }

  public applyFault(fault: ClockFault) {
    if (fault.type === 'CLOCK_SKEW') {
      this.skewOffset = fault.offsetMs;
    } else if (fault.type === 'TIME_JUMP') {
      this.advance(fault.offsetMs);
    }
  }

  public advance(ms: number) {
    if (ms < 0) {
      // Time jump backwards just changes the clock, it doesn't un-trigger timers
      this.now += ms;
      return;
    }

    const targetTime = this.now + ms;

    while (this.queue.length > 0) {
      // Find the earliest timer
      this.queue.sort((a, b) => a.triggerTime - b.triggerTime);
      const earliest = this.queue[0];

      if (earliest.triggerTime <= targetTime) {
        // Pop it
        this.queue.shift();
        
        // Advance clock to exactly the trigger time before executing
        this.now = earliest.triggerTime;
        
        try {
          earliest.callback(...earliest.args);
        } catch (e) {
          console.error('Error in virtual timer callback:', e);
        }

        // Reschedule if interval
        if (earliest.isInterval) {
          earliest.triggerTime = this.now + earliest.delay;
          this.queue.push(earliest);
        }
      } else {
        break;
      }
    }

    this.now = targetTime;
  }

  public runAll() {
    // Safety limit to prevent infinite loops from intervals
    let maxIterations = 10000; 
    
    while (this.queue.length > 0 && maxIterations > 0) {
      this.queue.sort((a, b) => a.triggerTime - b.triggerTime);
      const earliest = this.queue.shift()!;
      
      this.now = earliest.triggerTime;
      
      try {
        earliest.callback(...earliest.args);
      } catch (e) {
        console.error('Error in virtual timer callback:', e);
      }

      if (earliest.isInterval) {
        earliest.triggerTime = this.now + earliest.delay;
        this.queue.push(earliest);
      }
      
      maxIterations--;
    }
    
    if (maxIterations === 0 && this.queue.length > 0) {
      throw new Error('VirtualClock: runAll() hit max iterations. Do you have an un-cleared setInterval?');
    }
  }

  private fakeSetTimeout = (callback: Function, delay: number = 0, ...args: any[]): any => {
    const id = this.nextTimerId++;
    
    if (this.mode === 'accelerated') {
      this.queue.push({
        id,
        callback,
        triggerTime: this.now + delay,
        isInterval: false,
        delay,
        args
      });
      return id as any;
    } else {
      // Real-time passthrough
      const nativeId = this.nativeSetTimeout(() => {
        // Still remove from queue when it fires natively
        this.queue = this.queue.filter(t => t.id !== id);
        callback(...args);
      }, delay);
      
      this.queue.push({
        id,
        callback,
        triggerTime: this.now + delay, // Best effort track
        isInterval: false,
        delay,
        args,
        nativeId
      });
      return id as any;
    }
  };

  private fakeClearTimeout = (id: any): void => {
    const taskIndex = this.queue.findIndex(t => t.id === id);
    if (taskIndex !== -1) {
      const task = this.queue[taskIndex];
      if (task.nativeId) {
        this.nativeClearTimeout(task.nativeId);
      }
      this.queue.splice(taskIndex, 1);
    }
  };

  private fakeSetInterval = (callback: Function, delay: number = 0, ...args: any[]): any => {
    const id = this.nextTimerId++;
    
    if (this.mode === 'accelerated') {
      this.queue.push({
        id,
        callback,
        triggerTime: this.now + delay,
        isInterval: true,
        delay,
        args
      });
      return id as any;
    } else {
      const nativeId = this.nativeSetInterval(callback as any, delay, ...args);
      this.queue.push({
        id,
        callback,
        triggerTime: this.now + delay,
        isInterval: true,
        delay,
        args,
        nativeId
      });
      return id as any;
    }
  };

  private fakeClearInterval = (id: any): void => {
    this.fakeClearTimeout(id);
  };

  private createFakeDate() {
    const clock = this;
    const NativeDate = this.NativeDate;

    class FakeDate extends NativeDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(clock.getVirtualTime());
        } else {
          super(...(args as [any]));
        }
      }

      static now(): number {
        return clock.getVirtualTime();
      }
    }
    
    return FakeDate;
  }
}
