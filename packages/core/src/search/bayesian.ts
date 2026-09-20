import { FaultSchedule, FaultScheduleTemplate } from '@sibyl/shared';
import { SearchStrategy, SearchRunRecord } from './strategy';
import { PRNG } from '../prng';
import * as crypto from 'crypto';

/**
 * Box-Muller transform for generating normally distributed numbers using our deterministic PRNG.
 */
function randomNormal(prng: PRNG, mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while(u === 0) u = prng.next(); // Converting [0,1) to (0,1)
  while(v === 0) v = prng.next();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

/**
 * 1D Kernel Density Estimator
 */
class KDE {
  constructor(private samples: number[], private bandwidth: number) {}

  density(x: number): number {
    if (this.samples.length === 0) return 1; // Uniform prior if no samples
    let sum = 0;
    for (const sample of this.samples) {
      // Gaussian kernel
      const u = (x - sample) / this.bandwidth;
      sum += (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
    }
    return sum / (this.samples.length * this.bandwidth);
  }
}

export class BayesianSearchStrategy implements SearchStrategy {
  private prng: PRNG;
  
  // Track parameters across all runs for each template
  private history: {
    templateId: string;
    passed: boolean;
    delay: number;
  }[] = [];

  // Template of each issued schedule, by schedule id. Attaching it to the schedule as a hidden
  // field did not survive the orchestrator's zod validation, so history was never recorded and
  // TPE never left uniform sampling.
  private scheduleTemplates: Map<string, string> = new Map();

  constructor(
    private templates: FaultScheduleTemplate[],
    seed: string
  ) {
    this.prng = new PRNG(seed);
  }

  private sampleTpe(templateId: string, min: number, max: number): number {
    const records = this.history.filter(h => h.templateId === templateId);
    const passes = records.filter(r => r.passed).map(r => r.delay);
    const failures = records.filter(r => !r.passed).map(r => r.delay);

    // If we have fewer than 3 samples in either, explore uniformly
    if (failures.length < 2 || passes.length < 2) {
      return this.prng.nextInt(min, max + 1);
    }

    // Bandwidth rule of thumb
    const bwFail = Math.max((max - min) * 0.1, 1);
    const bwPass = Math.max((max - min) * 0.1, 1);

    const l = new KDE(failures, bwFail); // Distribution of failures
    const g = new KDE(passes, bwPass);   // Distribution of passes

    // Sample N candidates uniformly and pick the one that maximizes l(x) / g(x)
    const CANDIDATES = 25;
    let bestX = min;
    let bestRatio = -Infinity;

    for (let i = 0; i < CANDIDATES; i++) {
      const x = this.prng.nextInt(min, max + 1);
      const probFail = l.density(x);
      const probPass = g.density(x);
      const ratio = probFail / (probPass || 0.0001);

      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestX = x;
      }
    }

    return bestX;
  }

  next(iterationIndex: number): FaultSchedule[] {
    return this.templates.map(t => {
      const spec = { ...t.spec };

      if (t.delayMsRange) {
        spec.delayMs = this.sampleTpe(t.id, t.delayMsRange[0], t.delayMsRange[1]);
      }

      const prob = t.probabilityRange
        ? this.prng.next() * (t.probabilityRange[1] - t.probabilityRange[0]) + t.probabilityRange[0]
        : 1;

      const id = crypto.randomUUID();
      this.scheduleTemplates.set(id, t.id);
      return {
        id,
        spec,
        probability: prob,
        target: t.target,
      } as FaultSchedule;
    });
  }

  feedback(runResult: SearchRunRecord): void {
    for (const schedule of runResult.concreteSchedules) {
      const templateId = this.scheduleTemplates.get(schedule.id);
      const delay = 'delayMs' in schedule.spec ? schedule.spec.delayMs : undefined;
      if (templateId && delay !== undefined) {
        this.history.push({ templateId, passed: runResult.passed, delay });
      }
    }
  }

  exportState(): any {
    return { history: this.history, prng: this.prng.exportState() };
  }

  importState(state: any): void {
    if (!state) return;
    this.history = state.history ?? [];
    if (state.prng) this.prng.importState(state.prng);
  }
}
