import { FaultDriver, DriverContext } from './driver';
import { PRNG } from './prng';
import { VirtualClock, ClockMode } from './clock';
import { SimulationRun, FaultDomain, FaultSpec, CapturedEvent } from '@sibyl/shared';

export interface EngineClockOptions {
  mode: ClockMode;
  skewMs?: number;
  startTime?: number;
}

/**
 * Should a schedule with this probability fire, given a roll in [0, 1)?
 * Strictly less-than: probability 0 must never fire and probability 1 must always fire.
 * The orchestrator's duplicate-schedule fingerprint uses the same rule, so keep them together.
 */
export function rollHits(roll: number, probability: number): boolean {
  return roll < probability;
}

export class SimulationEngine {
  private masterRng: PRNG;
  private clock: VirtualClock;
  private drivers: Map<FaultDomain, FaultDriver> = new Map();
  private events: CapturedEvent[] = [];
  private domainRngs: Map<FaultDomain, PRNG> = new Map();

  constructor(
    private runConfig: SimulationRun,
    private seed: string,
    private clockOptions: EngineClockOptions = { mode: 'realtime' }
  ) {
    this.masterRng = new PRNG(this.seed);
    this.clock = new VirtualClock();
  }

  getClock(): VirtualClock {
    return this.clock;
  }

  getPrng(): PRNG {
    return this.masterRng;
  }

  getSeed(): string {
    return this.seed;
  }

  // The orchestrator installs drivers once, globally, and routes them here through AsyncLocalStorage.
  // This is kept for single-run use without an orchestrator.
  installDriver(driver: FaultDriver) {
    if (this.drivers.has(driver.domain)) {
      console.warn(`Driver for domain ${driver.domain} is already installed.`);
      return;
    }

    const context: DriverContext = {
      clock: this.clock,
      prng: this.masterRng,
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
    // One PRNG stream per domain, cached, so the sequence of decisions in one domain does not
    // depend on how many decisions were made in another.
    let domainRng = this.domainRngs.get(domain);
    if (!domainRng) {
      domainRng = this.masterRng.fork(domain);
      this.domainRngs.set(domain, domainRng);
    }

    const domainSchedules = this.runConfig.schedules.filter(s => s.spec.domain === domain);

    for (const schedule of domainSchedules) {
      const now = this.clock.getVirtualTime();
      if (schedule.startTime && now < schedule.startTime) continue;
      if (schedule.endTime && now > schedule.endTime) continue;

      let match = true;
      if (schedule.target) {
        for (const [key, value] of Object.entries(schedule.target)) {
          if (targetMetadata?.[key] !== value) {
            match = false;
            break;
          }
        }
      }
      if (!match) continue;

      const roll = domainRng.next();
      if (rollHits(roll, schedule.probability)) {
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
    const mode = this.clockOptions.mode;
    this.clock.install({
      mode,
      skewMs: this.clockOptions.skewMs,
      startTime: this.clockOptions.startTime,
      // Under an orchestrator nobody steps the clock by hand, so accelerated time must move itself.
      autoAdvance: mode === 'accelerated',
    });
    this.applyClockSchedules();
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

  /**
   * CLOCK faults have no I/O call to intercept, so they are decided once when the run starts:
   * each matching CLOCK schedule rolls, and a hit skews or jumps this run's clock.
   */
  private applyClockSchedules() {
    const hasClockSchedules = this.runConfig.schedules.some(s => s.spec.domain === 'CLOCK');
    if (!hasClockSchedules) return;

    const before = this.clock.getVirtualTime();
    const fault = this.evaluateFaultDecision('CLOCK', { phase: 'start' });
    if (!fault || fault.domain !== 'CLOCK') return;

    const offsetMs = fault.offsetMs ?? 0;
    this.clock.applyFault({ type: fault.type, offsetMs });
    this.recordEvent({
      domain: 'CLOCK',
      payload: { originalTime: before, skewedTime: this.clock.getVirtualTime() },
    } as any);
  }
}
