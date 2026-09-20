import type { FaultDriver, DriverContext } from '@sibyl/core';
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

abstract class PressureFaultDriver implements FaultDriver {
  abstract domain: 'CPU' | 'MEMORY';
  context?: DriverContext;

  protected abstract start(percentage: number, durationMs: number, onStop: () => void): void;
  protected abstract stop(): void;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
  }

  uninstall() {
    if (!this.context) return;
    // Stop while the context is still set, so the end of the pressure is recorded.
    this.stopPressure();
    stopWatchdog(this);
    this.context = undefined;
  }

  /**
   * Asks the scheduler whether to apply PRESSURE to this domain and, if so, starts it with the
   * scheduled percentage and duration. Returns the applied fault, or null.
   */
  applyScheduledFault(targetMetadata: Record<string, any> = {}) {
    const fault = this.context?.getFaultDecision(this.domain, targetMetadata);
    if (!fault || fault.type !== 'PRESSURE' || !('percentage' in fault)) return null;
    this.startPressure(fault.percentage, fault.durationMs);
    return fault;
  }

  startPressure(percentage: number, durationMs: number) {
    if (!checkSandboxMode()) return;
    // start() first ends any pressure already running, whose onStop releases the watchdog and records
    // utilization 0, so the watchdog must be acquired after it.
    this.start(percentage, durationMs, () => {
      stopWatchdog(this);
      this.recordUtilization(0);
    });
    startWatchdog(this);
    this.recordUtilization(percentage);
  }

  stopPressure() {
    this.stop();
  }

  private recordUtilization(utilization: number) {
    this.context?.recordEvent({ domain: this.domain, payload: { utilization } });
  }
}

export class CpuFaultDriver extends PressureFaultDriver {
  domain = 'CPU' as const;

  protected start(percentage: number, durationMs: number, onStop: () => void) {
    startCpuPressure(percentage, durationMs, onStop);
  }

  protected stop() {
    stopCpuPressure();
  }
}

export class MemoryFaultDriver extends PressureFaultDriver {
  domain = 'MEMORY' as const;

  protected start(percentage: number, durationMs: number, onStop: () => void) {
    startMemoryPressure(percentage, durationMs, onStop);
  }

  protected stop() {
    stopMemoryPressure();
  }
}
