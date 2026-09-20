import type { FaultDriver, DriverContext } from '@sibyl-core';
import { startWatchdog, stopWatchdog } from './watchdog';
import { startCpuPressure, stopCpuPressure } from './cpu-pressure';
import { startMemoryPressure, stopMemoryPressure } from './memory-pressure';

function checkSandboxMode() {
  if (process.env.SIBYL_SANDBOX_MODE !== 'true') {
    console.warn('[Sibyl Resource Driver] WARNING: Resource drivers actively consume physical CPU/RAM. They are disabled because SIBYL_SANDBOX_MODE=true is not set in the environment.');
    return false;
  }
  return true;
}

export class CpuFaultDriver implements FaultDriver {
  domain = 'CPU' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
  }

  uninstall() {
    if (!this.context) return;
    this.context = undefined;
    stopWatchdog();
    stopCpuPressure();
  }

  startPressure(percentage: number, durationMs: number) {
    if (!checkSandboxMode()) return;
    startWatchdog();
    startCpuPressure(percentage, durationMs);
  }

  stopPressure() {
    stopCpuPressure();
  }
}

export class MemoryFaultDriver implements FaultDriver {
  domain = 'MEMORY' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
  }

  uninstall() {
    if (!this.context) return;
    this.context = undefined;
    stopWatchdog();
    stopMemoryPressure();
  }

  startPressure(percentage: number, durationMs: number) {
    if (!checkSandboxMode()) return;
    startWatchdog();
    startMemoryPressure(percentage, durationMs);
  }

  stopPressure() {
    stopMemoryPressure();
  }
}
