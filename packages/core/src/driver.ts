import { FaultSpec, FaultDomain, CapturedEvent } from '@sibyl-shared';
import { VirtualClock } from './clock';
import { PRNG } from './prng';

export interface DriverContext {
  clock: VirtualClock;
  prng: PRNG;
  
  /**
   * Asks the Phase 3 scheduler: "Given this target metadata, should I inject a fault?"
   * The scheduler will handle pattern matching and labels.
   */
  getFaultDecision: (domain: FaultDomain, targetMetadata: Record<string, any>) => FaultSpec | null;
  
  /**
   * Records the fault execution for the dashboard telemetry.
   */
  recordEvent: (event: Omit<CapturedEvent, 'id' | 'timestamp'>) => void;
}

export interface FaultDriver {
  domain: FaultDomain;
  install(context: DriverContext): void;
  uninstall(): void;
}
