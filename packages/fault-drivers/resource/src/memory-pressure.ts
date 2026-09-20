import * as os from 'os';
import { WatchdogEvents } from './watchdog';

let activeBuffers: Buffer[] = [];
let controlInterval: NodeJS.Timeout | null = null;
let timeoutHandle: NodeJS.Timeout | null = null;
let abortListener: (() => void) | null = null;
let onStopped: (() => void) | null = null;

/** `onStop` runs once when this pressure ends: by stopMemoryPressure(), its duration elapsing, or a watchdog abort. */
export function startMemoryPressure(targetPercentage: number, durationMs: number, onStop?: () => void) {
  if (controlInterval) stopMemoryPressure();
  onStopped = onStop ?? null;

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

  abortListener = () => {
    stopMemoryPressure();
  };
  WatchdogEvents.on('ABORT_PRESSURE', abortListener);

  controlInterval = setInterval(() => {
    const totalMem = os.totalmem();
    const targetUsedMem = totalMem * (targetPercentage / 100);
    const currentUsedMem = totalMem - os.freemem();
    
    if (currentUsedMem < targetUsedMem) {
      // Need more pressure
      try {
        activeBuffers.push(Buffer.alloc(CHUNK_SIZE));
      } catch (e) {
        // OOM protection inside VM
      }
    } else if (currentUsedMem > targetUsedMem + CHUNK_SIZE) {
      // Release pressure
      if (activeBuffers.length > 0) activeBuffers.pop();
    }
  }, 100);
  controlInterval.unref();

  timeoutHandle = setTimeout(() => {
    stopMemoryPressure();
  }, durationMs);
  timeoutHandle.unref();
}

export function stopMemoryPressure() {
  if (controlInterval) {
    clearInterval(controlInterval);
    controlInterval = null;
  }
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (abortListener) {
    WatchdogEvents.off('ABORT_PRESSURE', abortListener);
    abortListener = null;
  }
  activeBuffers = [];

  const callback = onStopped;
  onStopped = null;
  callback?.();
}
