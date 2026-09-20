import * as os from 'os';
import { EventEmitter } from 'events';

export const WatchdogEvents = new EventEmitter();

let watchdogInterval: NodeJS.Timeout | null = null;
// CPU and memory drivers share one watchdog; it runs while any of them still needs it.
const owners = new Set<object>();

export const SAFETY_CEILINGS = {
  maxCpuLoad: 90, // percent
  maxMemUsage: 95 // percent
};

export interface CpuTimes {
  idle: number;
  total: number;
}

export function sampleCpuTimes(cpus: os.CpuInfo[] = os.cpus()): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

/** Busy percentage across all cores between two samples. */
export function cpuLoadBetween(previous: CpuTimes, current: CpuTimes): number {
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return 0;
  return (1 - (current.idle - previous.idle) / totalDelta) * 100;
}

export function isWatchdogRunning(): boolean {
  return watchdogInterval !== null;
}

export function startWatchdog(owner: object, intervalMs = 1000) {
  owners.add(owner);
  if (watchdogInterval) return;

  // os.loadavg() is always [0, 0, 0] on Windows, which silently disabled the CPU ceiling there.
  // Per-core busy/idle time deltas work on every platform.
  let lastCpuTimes = sampleCpuTimes();

  watchdogInterval = setInterval(() => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;

    const cpuTimes = sampleCpuTimes();
    const cpuLoad = cpuLoadBetween(lastCpuTimes, cpuTimes);
    lastCpuTimes = cpuTimes;

    if (memUsage > SAFETY_CEILINGS.maxMemUsage || cpuLoad > SAFETY_CEILINGS.maxCpuLoad) {
      console.error(`[Sibyl Watchdog] Safety ceiling exceeded! CPU: ${cpuLoad.toFixed(1)}%, Mem: ${memUsage.toFixed(1)}%. Triggering ABORT.`);
      WatchdogEvents.emit('ABORT_PRESSURE');
    }
  }, intervalMs);
  watchdogInterval.unref(); // Don't block process exit
}

export function stopWatchdog(owner: object) {
  owners.delete(owner);
  if (owners.size > 0 || !watchdogInterval) return;
  clearInterval(watchdogInterval);
  watchdogInterval = null;
}
