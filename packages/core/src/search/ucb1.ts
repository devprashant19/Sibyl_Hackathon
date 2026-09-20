import { FaultSchedule, FaultScheduleTemplate } from '@sibyl-shared';
import { SearchStrategy, SearchRunRecord } from './strategy';
import { PRNG } from '../prng';
import * as crypto from 'crypto';

interface CoverageNode {
  visits: number;
  failures: number;
}

// Discretization config
const BUCKET_COUNT = 4;

export class Ucb1SearchStrategy implements SearchStrategy {
  private prng: PRNG;
  private totalRuns = 0;
  private coverage: Map<string, CoverageNode> = new Map();
  
  // Shrinking state
  private shrinkMode = false;
  private shrinkAnchor: FaultSchedule[] | null = null;
  private shrinkQueue: FaultSchedule[][] = [];
  
  // Cache of possible discretized buckets for each template
  private templateSpace: Map<string, any[]> = new Map();

  constructor(
    private templates: FaultScheduleTemplate[],
    seed: string
  ) {
    this.prng = new PRNG(seed);
    this.initTemplateSpace();
  }

  private initTemplateSpace() {
    for (const t of this.templates) {
      const buckets = [];
      const probStep = t.probabilityRange 
        ? (t.probabilityRange[1] - t.probabilityRange[0]) / BUCKET_COUNT
        : 0;
      const delayStep = t.delayMsRange
        ? (t.delayMsRange[1] - t.delayMsRange[0]) / BUCKET_COUNT
        : 0;

      for (let p = 0; p < (t.probabilityRange ? BUCKET_COUNT : 1); p++) {
        for (let d = 0; d < (t.delayMsRange ? BUCKET_COUNT : 1); d++) {
          const prob = t.probabilityRange 
            ? t.probabilityRange[0] + (p * probStep) + (probStep / 2) // Midpoint of bucket
            : 1;
            
          const delay = t.delayMsRange
            ? Math.floor(t.delayMsRange[0] + (d * delayStep) + (delayStep / 2))
            : undefined;

          buckets.push({ probBucket: p, delayBucket: d, prob, delay });
        }
      }
      this.templateSpace.set(t.id, buckets);
    }
  }

  private getBucketKey(templateId: string, probBucket: number, delayBucket: number): string {
    return `${templateId}:P${probBucket}:D${delayBucket}`;
  }

  next(iterationIndex: number): FaultSchedule[] {
    if (this.shrinkMode && this.shrinkQueue.length > 0) {
      return this.shrinkQueue.shift()!;
    }

    this.shrinkMode = false;

    // Standard UCB1 Exploration
    const schedules: FaultSchedule[] = [];

    for (const t of this.templates) {
      const buckets = this.templateSpace.get(t.id)!;
      let bestBucket = buckets[0];
      let bestScore = -Infinity;

      for (const b of buckets) {
        const key = this.getBucketKey(t.id, b.probBucket, b.delayBucket);
        const node = this.coverage.get(key) || { visits: 0, failures: 0 };
        
        let score: number;
        if (node.visits === 0) {
          score = Infinity; // Always visit unvisited buckets first
        } else {
          const exploitation = node.failures / node.visits;
          const exploration = Math.sqrt(Math.log(this.totalRuns || 1) / node.visits);
          // C = 1.414 (standard sqrt(2))
          score = exploitation + 1.414 * exploration;
        }

        // Add a tiny bit of PRNG noise to break ties deterministically
        score += this.prng.next() * 0.000001;

        if (score > bestScore) {
          bestScore = score;
          bestBucket = b;
        }
      }

      // Record visit instantly so we don't pick it 5 times if concurrency is high?
      // Wait, feedback() records visits. If concurrency is high, multiple runs might pick the same unvisited bucket. 
      // That's acceptable for standard UCB1.

      const spec = { ...t.spec };
      if (bestBucket.delay !== undefined) spec.delayMs = bestBucket.delay;

      schedules.push({
        id: crypto.randomUUID(), // we can't use PRNG for uuids easily without a deterministic UUID gen, but orchestrator doesn't care
        spec,
        probability: bestBucket.prob,
        target: t.target,
        // Hack: attach bucket keys for feedback loop
        _ucb1Key: this.getBucketKey(t.id, bestBucket.probBucket, bestBucket.delayBucket)
      } as any);
    }

    return schedules;
  }

  feedback(runResult: SearchRunRecord): void {
    this.totalRuns++;

    if (!runResult.passed) {
      // Trigger shrink mode if we found a new anchor
      if (!this.shrinkMode) {
        this.shrinkMode = true;
        this.shrinkAnchor = runResult.concreteSchedules;
        this.generateShrinkQueue();
      }
    }

    // Update UCB1 coverage tracking
    for (const schedule of runResult.concreteSchedules) {
      const key = (schedule as any)._ucb1Key;
      if (key) {
        const node = this.coverage.get(key) || { visits: 0, failures: 0 };
        node.visits++;
        if (!runResult.passed) {
          node.failures++;
        }
        this.coverage.set(key, node);
      }
    }
  }

  private generateShrinkQueue() {
    this.shrinkQueue = [];
    if (!this.shrinkAnchor) return;

    // Pruning: Try removing one fault at a time
    for (let i = 0; i < this.shrinkAnchor.length; i++) {
      const pruned = [...this.shrinkAnchor];
      pruned.splice(i, 1);
      this.shrinkQueue.push(pruned);
    }
  }

  exportState(): any {
    return {
      totalRuns: this.totalRuns,
      coverage: Array.from(this.coverage.entries()),
      shrinkMode: this.shrinkMode,
      shrinkAnchor: this.shrinkAnchor,
      shrinkQueue: this.shrinkQueue,
      prng: (this.prng as any).exportState()
    };
  }

  importState(state: any): void {
    if (!state) return;
    this.totalRuns = state.totalRuns || 0;
    if (state.coverage) {
      this.coverage = new Map(state.coverage);
    }
    this.shrinkMode = state.shrinkMode || false;
    this.shrinkAnchor = state.shrinkAnchor || null;
    this.shrinkQueue = state.shrinkQueue || [];
    if (state.prng && (this.prng as any).importState) {
      (this.prng as any).importState(state.prng);
    }
  }
}
