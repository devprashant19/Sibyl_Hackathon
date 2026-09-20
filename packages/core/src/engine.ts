import { FaultDriver, DriverContext } from './driver';
import { PRNG } from './prng';
import { VirtualClock } from './clock';
import { SimulationRun, FaultDomain, FaultSpec, CapturedEvent } from '@sibyl-shared';

export class SimulationEngine {
  private masterRng: PRNG;
  private clock: VirtualClock;
  private drivers: Map<FaultDomain, FaultDriver> = new Map();
  private events: CapturedEvent[] = [];
  private domainRngs: Map<FaultDomain, PRNG> = new Map();

  constructor(
    private runConfig: SimulationRun,
    private seed: string,
    private clockOptions: { mode: 'realtime' | 'accelerated', skewMs?: number } = { mode: 'realtime' }
  ) {
    this.masterRng = new PRNG(this.seed);
    this.clock = new VirtualClock();
  }

  // Instead of installing drivers locally, Orchestrator handles it.
  // We keep this for backwards compatibility with single-run mode.
  installDriver(driver: FaultDriver) {
    if (this.drivers.has(driver.domain)) {
      throw new Error(`Driver for domain ${driver.domain} is already installed.`);
    }

    const context: DriverContext = {
      clock: this.clock,
      getFaultDecision: (domain: FaultDomain, targetMetadata: Record<string, any>) => {
        return this.evaluateFaultDecision(domain, targetMetadata);
      },
      recordEvent: (event: Omit<CapturedEvent, 'id' | 'timestamp'>) => {
        this.recordEvent(event);
      }
    };

    driver.install(context);
    this.drivers.set(driver.domain, driver);
  }

  evaluateFaultDecision(domain: FaultDomain, targetMetadata: Record<string, any>): FaultSpec | null {
    // Fork a deterministic PRNG for this specific domain if not cached
    // To maintain strict sequence, we should cache domain RNGs inside Engine.
    if (!this.domainRngs) {
      this.domainRngs = new Map();
    }
    let domainRng = this.domainRngs.get(domain);
    if (!domainRng) {
      domainRng = this.masterRng.fork(domain);
      this.domainRngs.set(domain, domainRng);
    }

    const domainSchedules = this.runConfig.schedules.filter(
      s => s.spec.domain === domain
    );

    for (const schedule of domainSchedules) {
      const now = this.clock.getVirtualTime();
      if (schedule.startTime && now < schedule.startTime) continue;
      if (schedule.endTime && now > schedule.endTime) continue;

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

      const roll = domainRng.next();
      if (roll <= schedule.probability) {
        return schedule.spec;
      }
    }
    
    return null;
  }

  recordEvent(event: Omit<CapturedEvent, 'id' | 'timestamp'>) {
    this.events.push({
      ...event,
      id: `${event.domain}-${this.events.length}`,
      timestamp: this.clock.getVirtualTime(),
    } as CapturedEvent);
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
