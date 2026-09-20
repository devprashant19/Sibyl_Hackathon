import { FaultDriver, DriverContext } from './driver';
import { PRNG } from './prng';
import { VirtualClock } from './clock';
import { SimulationRun, FaultDomain, FaultSpec, CapturedEvent } from '@sibyl-shared';

export class SimulationEngine {
  private masterRng: PRNG;
  private clock: VirtualClock;
  private drivers: Map<FaultDomain, FaultDriver> = new Map();
  private events: CapturedEvent[] = [];

  constructor(
    private runConfig: SimulationRun,
    private seed: string,
    private clockOptions: { mode: 'realtime' | 'accelerated', skewMs?: number } = { mode: 'realtime' }
  ) {
    this.masterRng = new PRNG(this.seed);
    this.clock = new VirtualClock();
  }

  installDriver(driver: FaultDriver) {
    if (this.drivers.has(driver.domain)) {
      throw new Error(`Driver for domain ${driver.domain} is already installed.`);
    }

    // Fork a deterministic PRNG for this specific domain
    const domainRng = this.masterRng.fork(driver.domain);
    
    // Filter schedules that apply to this driver's domain
    const domainSchedules = this.runConfig.schedules.filter(
      s => s.spec.domain === driver.domain
    );

    const context: DriverContext = {
      clock: this.clock,
      getFaultDecision: (domain: FaultDomain, targetMetadata: Record<string, any>): FaultSpec | null => {
        // Evaluate all schedules for this domain
        for (const schedule of domainSchedules) {
          // Check timeframe
          const now = this.clock.getVirtualTime();
          if (schedule.startTime && now < schedule.startTime) continue;
          if (schedule.endTime && now > schedule.endTime) continue;

          // Check targets (subset match)
          let match = true;
          if (schedule.target) {
            for (const [key, value] of Object.entries(schedule.target)) {
              if (targetMetadata[key] !== value) {
                match = false;
                break;
              }
            }
          }
          if (!match) continue;

          // Check probability using the namespaced RNG
          const roll = domainRng.next();
          if (roll <= schedule.probability) {
            return schedule.spec;
          }
        }
        
        return null;
      },
      recordEvent: (event: Omit<CapturedEvent, 'id' | 'timestamp'>) => {
        this.events.push({
          ...event,
          id: `${event.domain}-${this.events.length}`,
          timestamp: this.clock.getVirtualTime(),
        } as CapturedEvent);
      }
    };

    driver.install(context);
    this.drivers.set(driver.domain, driver);
  }

  start() {
    this.clock.install(this.clockOptions.mode);
  }

  stop() {
    for (const driver of this.drivers.values()) {
      driver.uninstall();
    }
    this.drivers.clear();
    this.clock.uninstall();
  }

  getEvents() {
    return this.events;
  }
}
