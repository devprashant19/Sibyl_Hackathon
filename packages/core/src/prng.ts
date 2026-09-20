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
    let t = (this.state += 0x6d2b79f5);
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
   * Deterministic namespacing scheme.
   * Derives a new, independent PRNG stream that is reproducibly bound to the parent seed and the namespace.
   * Order-independent: calling fork('A') before or after generating numbers on the parent yields the same child PRNG.
   */
  fork(namespace: string): PRNG {
    // Combine parent's initial seed with the namespace to derive a new independent seed
    const newSeed = fnv1a(this.initialSeed.toString() + ":" + namespace);
    return new PRNG(newSeed);
  }
}
