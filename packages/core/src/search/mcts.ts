import { FaultSchedule, FaultScheduleTemplate } from '@sibyl-shared';
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

export class MctsSearchStrategy implements SearchStrategy {
  private prng: PRNG;
  private root: MctsNode;
  private allBuckets: Bucket[] = [];
  
  private lastLeaf: MctsNode | null = null;
  private runIndex = 0;
  private BUCKET_COUNT = 4;

  constructor(
    private templates: FaultScheduleTemplate[],
    seed: string
  ) {
    this.prng = new PRNG(seed);
    this.initBuckets();
    this.root = new MctsNode(null, null, [...this.allBuckets]);
  }

  private initBuckets() {
    for (const t of this.templates) {
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

          this.allBuckets.push({
            templateId: t.id,
            probBucket: p,
            delayBucket: d,
            prob,
            delay
          });
        }
      }
    }
  }

  private getBucketKey(b: Bucket): string {
    return `${b.templateId}:P${b.probBucket}:D${b.delayBucket}`;
  }

  private selectPromisingNode(): MctsNode {
    let node = this.root;
    while (node.unexpandedMoves.length === 0 && node.children.size > 0) {
      // Pick best child based on UCT
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
    if (node.unexpandedMoves.length === 0) return node;

    // Pick a random unexpanded move
    const moveIdx = this.prng.nextInt(0, node.unexpandedMoves.length);
    const move = node.unexpandedMoves[moveIdx];
    
    // Remove from unexpanded
    node.unexpandedMoves.splice(moveIdx, 1);

    // Calculate valid future moves (prevent picking conflicting buckets for the same template)
    const nextUnexpanded = node.unexpandedMoves.filter(m => m.templateId !== move.templateId);

    const child = new MctsNode(node, move, nextUnexpanded);
    node.children.set(this.getBucketKey(move), child);
    
    return child;
  }

  next(iterationIndex: number): FaultSchedule[] {
    this.runIndex++;

    // 1. Selection
    const promisingNode = this.selectPromisingNode();

    // 2. Expansion
    const leaf = this.expand(promisingNode);
    this.lastLeaf = leaf;

    // 3. Rollout
    // Trace back path to get the locked choices
    const lockedChoices: Bucket[] = [];
    let curr: MctsNode | null = leaf;
    const usedTemplates = new Set<string>();

    while (curr && curr.choice) {
      lockedChoices.push(curr.choice);
      usedTemplates.add(curr.choice.templateId);
      curr = curr.parent;
    }

    // Uniformly sample for the rest of the templates
    for (const t of this.templates) {
      if (usedTemplates.has(t.id)) continue;

      // Filter all buckets for this template
      const available = this.allBuckets.filter(b => b.templateId === t.id);
      if (available.length > 0) {
        const randomChoice = this.prng.pick(available);
        lockedChoices.push(randomChoice);
      }
    }

    // Convert buckets to schedules
    return lockedChoices.map(b => {
      const t = this.templates.find(temp => temp.id === b.templateId)!;
      const spec = { ...t.spec };
      if (b.delay !== undefined) spec.delayMs = b.delay;

      return {
        id: crypto.randomUUID(),
        spec,
        probability: b.prob,
        target: t.target
      } as FaultSchedule;
    });
  }

  feedback(runResult: SearchRunRecord): void {
    const reward = runResult.passed ? 0 : 1;

    // 4. Backpropagation
    let curr: MctsNode | null = this.lastLeaf;
    while (curr) {
      curr.visits++;
      curr.failures += reward;
      curr = curr.parent;
    }
  }
}
