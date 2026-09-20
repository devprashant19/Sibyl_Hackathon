import * as os from 'os';
import { EventEmitter } from 'events';

export const WatchdogEvents = new EventEmitter();

let watchdogInterval: NodeJS.Timeout | null = null;

export const SAFETY_CEILINGS = {
  maxCpuLoad: 90, // percent
  maxMemUsage: 95 // percent
};

export function startWatchdog(intervalMs = 1000) {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;
    
    // Simplistic CPU load check (loadavg is across 1 min, but good enough for hard limit fallback)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuLoad = (loadAvg / cpuCount) * 100;

    if (memUsage > SAFETY_CEILINGS.maxMemUsage || cpuLoad > SAFETY_CEILINGS.maxCpuLoad) {
      console.error(`[Sibyl Watchdog] Safety ceiling exceeded! CPU: ${cpuLoad.toFixed(1)}%, Mem: ${memUsage.toFixed(1)}%. Triggering ABORT.`);
      WatchdogEvents.emit('ABORT_PRESSURE');
    }
  }, intervalMs);
  watchdogInterval.unref(); // Don't block process exit
}

export function stopWatchdog() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}
