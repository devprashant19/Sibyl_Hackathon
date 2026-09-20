import { FaultSchedule, FaultScheduleTemplate } from '@sibyl/shared';
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
  // Which bucket each issued schedule came from, keyed by schedule id. This used to ride along on
  // the schedule as `_ucb1Key`, but the orchestrator validates schedules with zod, which strips
  // unknown keys — so feedback never found a key and UCB1 never learned anything.
  private scheduleBuckets: Map<string, string> = new Map();
  // Issued but not yet reported, so concurrent workers don't all pick the same unvisited bucket.
  private pending: Map<string, number> = new Map();
  
  // Shrinking state
  private shrinkMode = false;
  private shrinkAnchor: FaultSchedule[] | null = null;
  private shrinkQueue: FaultSchedule[][] = [];
  private minimalFailing: FaultSchedule[] | null = null;
  
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
        const effectiveVisits = node.visits + (this.pending.get(key) || 0);

        let score: number;
        if (effectiveVisits === 0) {
          score = Infinity; // Always visit unvisited buckets first
        } else {
          const exploitation = node.failures / effectiveVisits;
          const exploration = Math.sqrt(Math.log(Math.max(this.totalRuns, 1)) / effectiveVisits);
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

      const spec = { ...t.spec };
      if (bestBucket.delay !== undefined) spec.delayMs = bestBucket.delay;

      const key = this.getBucketKey(t.id, bestBucket.probBucket, bestBucket.delayBucket);
      const id = crypto.randomUUID(); // ids never influence behaviour, so they need not be seeded
      this.scheduleBuckets.set(id, key);
      this.pending.set(key, (this.pending.get(key) || 0) + 1);

      schedules.push({
        id,
        spec,
        probability: bestBucket.prob,
        target: t.target,
      } as FaultSchedule);
    }

    return schedules;
  }

  feedback(runResult: SearchRunRecord): void {
    this.totalRuns++;

    if (!runResult.passed) {
      const smaller = this.shrinkAnchor && runResult.concreteSchedules.length < this.shrinkAnchor.length;
      if (!this.shrinkMode || smaller) {
        // A new failure, or a pruned schedule that still fails: that becomes the anchor and we
        // keep pruning from it, so shrinking continues down to a schedule where removing any
        // single fault makes the failure disappear.
        this.shrinkMode = true;
        this.shrinkAnchor = runResult.concreteSchedules;
        if (!this.minimalFailing || runResult.concreteSchedules.length < this.minimalFailing.length) {
          this.minimalFailing = runResult.concreteSchedules;
        }
        this.generateShrinkQueue();
      }
    }

    // Update UCB1 coverage tracking
    for (const schedule of runResult.concreteSchedules) {
      const key = this.scheduleBuckets.get(schedule.id);
      if (key) {
        const pending = this.pending.get(key) || 0;
        if (pending > 0) this.pending.set(key, pending - 1);
        const node = this.coverage.get(key) || { visits: 0, failures: 0 };
        node.visits++;
        if (!runResult.passed) {
          node.failures++;
        }
        this.coverage.set(key, node);
      }
    }
  }

  /** The smallest schedule set seen to fail so far, or null if nothing has failed. */
  getMinimalFailingSchedule(): FaultSchedule[] | null {
    return this.minimalFailing;
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
      scheduleBuckets: Array.from(this.scheduleBuckets.entries()),
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
    if (state.scheduleBuckets) this.scheduleBuckets = new Map(state.scheduleBuckets);
    if (state.prng && (this.prng as any).importState) {
      (this.prng as any).importState(state.prng);
    }
  }
}
