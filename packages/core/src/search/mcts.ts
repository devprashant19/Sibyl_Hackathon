import { FaultSchedule, FaultScheduleTemplate } from '@sibyl/shared';
import { SearchStrategy, SearchRunRecord } from './strategy';
import { PRNG } from '../prng';
import * as crypto from 'crypto';

interface Bucket {
  probBucket: number;
  delayBucket: number;
  prob: number;
  delay?: number;
  templateId: string;
}

class MctsNode {
  visits = 0;
  failures = 0;
  children: Map<string, MctsNode> = new Map();

  constructor(
    public parent: MctsNode | null,
    public choice: Bucket | null, // null for root
    public depth: number,
    public unexpandedMoves: Bucket[]
  ) {}

  get uctScore(): number {
    if (this.visits === 0) return Infinity;
    if (!this.parent || this.parent.visits === 0) return Infinity;
    const exploitation = this.failures / this.visits;
    const exploration = Math.sqrt(Math.log(this.parent.visits) / this.visits);
    return exploitation + 1.414 * exploration; // C = sqrt(2)
  }
}

/**
 * Monte Carlo Tree Search over fault schedules.
 *
 * The tree has one level per template, in template order: the root chooses a bucket for template 0,
 * its children a bucket for template 1, and so on. A path from the root is a partial schedule; the
 * rollout fills the remaining templates at random. Failures are the reward, so the search
 * concentrates on the bucket combinations that break the workflow.
 */
export class MctsSearchStrategy implements SearchStrategy {
  private prng: PRNG;
  private root: MctsNode;
  private bucketsByTemplate: Map<string, Bucket[]> = new Map();
  private BUCKET_COUNT = 4;

  // Which tree leaf produced each issued schedule set, keyed by every schedule id in the set.
  // Keeping only the most recent leaf credited the wrong node whenever runs finished out of order.
  private leafBySchedule: Map<string, MctsNode> = new Map();

  constructor(
    private templates: FaultScheduleTemplate[],
    seed: string
  ) {
    this.prng = new PRNG(seed);
    this.initBuckets();
    this.root = new MctsNode(null, null, 0, this.movesAtDepth(0));
  }

  private initBuckets() {
    for (const t of this.templates) {
      const buckets: Bucket[] = [];
      const probStep = t.probabilityRange
        ? (t.probabilityRange[1] - t.probabilityRange[0]) / this.BUCKET_COUNT
        : 0;
      const delayStep = t.delayMsRange
        ? (t.delayMsRange[1] - t.delayMsRange[0]) / this.BUCKET_COUNT
        : 0;

      for (let p = 0; p < (t.probabilityRange ? this.BUCKET_COUNT : 1); p++) {
        for (let d = 0; d < (t.delayMsRange ? this.BUCKET_COUNT : 1); d++) {
          const prob = t.probabilityRange
            ? t.probabilityRange[0] + (p * probStep) + (probStep / 2)
            : 1;

          const delay = t.delayMsRange
            ? Math.floor(t.delayMsRange[0] + (d * delayStep) + (delayStep / 2))
            : undefined;

          buckets.push({ templateId: t.id, probBucket: p, delayBucket: d, prob, delay });
        }
      }
      this.bucketsByTemplate.set(t.id, buckets);
    }
  }

  private movesAtDepth(depth: number): Bucket[] {
    const template = this.templates[depth];
    return template ? [...this.bucketsByTemplate.get(template.id)!] : [];
  }

  private getBucketKey(b: Bucket): string {
    return `${b.templateId}:P${b.probBucket}:D${b.delayBucket}`;
  }

  private selectPromisingNode(): MctsNode {
    let node = this.root;
    while (node.unexpandedMoves.length === 0 && node.children.size > 0) {
      let bestScore = -Infinity;
      let bestChild: MctsNode | null = null;
      for (const child of node.children.values()) {
        // Break ties with PRNG noise
        const score = child.uctScore + (this.prng.next() * 0.0001);
        if (score > bestScore) {
          bestScore = score;
          bestChild = child;
        }
      }
      if (!bestChild) break;
      node = bestChild;
    }
    return node;
  }

  private expand(node: MctsNode): MctsNode {
    if (node.unexpandedMoves.length === 0) return node; // terminal: every template is chosen

    const moveIdx = this.prng.nextInt(0, node.unexpandedMoves.length);
    const [move] = node.unexpandedMoves.splice(moveIdx, 1);
    const child = new MctsNode(node, move, node.depth + 1, this.movesAtDepth(node.depth + 1));
    node.children.set(this.getBucketKey(move), child);
    return child;
  }

  next(iterationIndex: number): FaultSchedule[] {
    // 1. Selection, 2. Expansion
    const leaf = this.expand(this.selectPromisingNode());

    // 3. Rollout: the path fixes the first `leaf.depth` templates; the rest are sampled uniformly.
    const chosen = new Map<string, Bucket>();
    for (let curr: MctsNode | null = leaf; curr && curr.choice; curr = curr.parent) {
      chosen.set(curr.choice.templateId, curr.choice);
    }

    const schedules = this.templates.map(t => {
      const bucket = chosen.get(t.id) ?? this.prng.pick(this.bucketsByTemplate.get(t.id)!);
      const spec = { ...t.spec };
      if (bucket.delay !== undefined) spec.delayMs = bucket.delay;
      return {
        id: crypto.randomUUID(),
        spec,
        probability: bucket.prob,
        target: t.target
      } as FaultSchedule;
    });

    for (const s of schedules) this.leafBySchedule.set(s.id, leaf);
    return schedules;
  }

  feedback(runResult: SearchRunRecord): void {
    const reward = runResult.passed ? 0 : 1;

    const first = runResult.concreteSchedules[0];
    const leaf = first ? this.leafBySchedule.get(first.id) : undefined;
    if (!leaf) return;
    for (const s of runResult.concreteSchedules) this.leafBySchedule.delete(s.id);

    // 4. Backpropagation
    for (let curr: MctsNode | null = leaf; curr; curr = curr.parent) {
      curr.visits++;
      curr.failures += reward;
    }
  }

  exportState(): any {
    const serialize = (node: MctsNode): any => ({
      visits: node.visits,
      failures: node.failures,
      choice: node.choice,
      unexpanded: node.unexpandedMoves,
      children: Array.from(node.children.values()).map(serialize),
    });
    return { root: serialize(this.root), prng: this.prng.exportState() };
  }

  importState(state: any): void {
    if (!state?.root) return;
    const build = (data: any, parent: MctsNode | null, depth: number): MctsNode => {
      const node = new MctsNode(parent, data.choice, depth, data.unexpanded ?? []);
      node.visits = data.visits;
      node.failures = data.failures;
      for (const child of data.children ?? []) {
        node.children.set(this.getBucketKey(child.choice), build(child, node, depth + 1));
      }
      return node;
    };
    this.root = build(state.root, null, 0);
    if (state.prng) this.prng.importState(state.prng);
  }
}
