/**
 * FNV-1a 32-bit hash algorithm
 */
function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by FNV prime 16777619 using bitshifts
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

export class PRNG {
  private initialSeed: number;
  private state: number;

  constructor(seed: number | string) {
    if (typeof seed === 'string') {
      this.initialSeed = fnv1a(seed);
    } else {
      this.initialSeed = seed >>> 0;
    }
    this.state = this.initialSeed;
  }

  /**
   * Generates a pseudo-random float between [0, 1) using mulberry32.
   */
  next(): number {
    // State must wrap at 32 bits. Letting it grow as a double is output-identical for the first
    // ~4.9M draws, then loses precision and eventually stops changing at all.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a pseudo-random integer in [min, max).
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Picks a random element from the provided array.
   */
  pick<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error("Cannot pick from an empty array.");
    }
    return arr[this.nextInt(0, arr.length)];
  }

  /**
   * A v4-shaped UUID drawn from this stream. Used wherever an id must be reproducible from a
   * seed (schedule ids, replayed run ids) — crypto.randomUUID() would make two runs of the same
   * seed differ in their ids even when their behaviour is identical.
   */
  uuid(): string {
    const hex: string[] = [];
    for (let i = 0; i < 32; i++) hex.push(this.nextInt(0, 16).toString(16));
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }

  /**
   * Deterministic namespacing scheme.
   * Derives a new, independent PRNG stream that is reproducibly bound to the parent seed and the namespace.
   * Order-independent: calling fork('A') before or after generating numbers on the parent yields the same child PRNG.
   */
  fork(namespace: string): PRNG {
    // Combine parent's initial seed with the namespace to derive a new independent seed
    const newSeed = fnv1a(this.initialSeed.toString() + ":" + namespace);
    return new PRNG(newSeed);
  }

  exportState(): any {
    return {
      state: this.state,
      initialSeed: this.initialSeed
    };
  }

  importState(data: any): void {
    if (data && typeof data.state === 'number') {
      this.state = data.state;
      this.initialSeed = data.initialSeed;
    }
  }
}
