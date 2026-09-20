import { describe, it, expect } from 'vitest';
import { PRNG } from '../src/prng';

describe('PRNG (mulberry32)', () => {
  it('should be deterministic based on the seed', () => {
    const rng1 = new PRNG(12345);
    const rng2 = new PRNG(12345);

    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('should generate numbers in the correct ranges', () => {
    const rng = new PRNG(999);
    for (let i = 0; i < 1000; i++) {
      const float = rng.next();
      expect(float).toBeGreaterThanOrEqual(0);
      expect(float).toBeLessThan(1);

      const int = rng.nextInt(5, 10);
      expect(int).toBeGreaterThanOrEqual(5);
      expect(int).toBeLessThan(10);
    }
  });

  it('should pick elements from an array', () => {
    const rng = new PRNG(42);
    const items = ['a', 'b', 'c', 'd'];
    const picks = new Set();
    
    for (let i = 0; i < 50; i++) {
      const picked = rng.pick(items);
      expect(items).toContain(picked);
      picks.add(picked);
    }
    
    expect(picks.size).toBe(4); // should have eventually picked everything
  });

  describe('fork(namespace)', () => {
    it('should be deterministic and order-independent', () => {
      const root = new PRNG(1337);
      
      const forkA1 = root.fork('http');
      root.next(); // mutate root state
      root.next();
      const forkA2 = root.fork('http'); // should be exactly the same as forkA1
      
      expect(forkA1.next()).toBe(forkA2.next());
      expect(forkA1.nextInt(0, 100)).toBe(forkA2.nextInt(0, 100));
    });

    it('should generate completely different values for different namespaces', () => {
      const root = new PRNG(1337);
      const httpFork = root.fork('http');
      const dbFork = root.fork('db');

      let identicalCount = 0;
      for (let i = 0; i < 1000; i++) {
        if (httpFork.next() === dbFork.next()) {
          identicalCount++;
        }
      }
      expect(identicalCount).toBeLessThan(2);
    });

    it('should be statistically independent across namespaces', () => {
      // Calculate Pearson correlation coefficient between two namespaces
      const root = new PRNG(123456789);
      const fork1 = root.fork('namespace_A');
      const fork2 = root.fork('namespace_B');

      const N = 10000;
      let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;

      for (let i = 0; i < N; i++) {
        const v1 = fork1.next();
        const v2 = fork2.next();
        
        sum1 += v1;
        sum2 += v2;
        sum1Sq += v1 * v1;
        sum2Sq += v2 * v2;
        pSum += v1 * v2;
      }

      const num = pSum - (sum1 * sum2 / N);
      const den = Math.sqrt((sum1Sq - Math.pow(sum1, 2) / N) * (sum2Sq - Math.pow(sum2, 2) / N));
      
      const correlation = num / den;
      
      // Pearson correlation should be very close to 0 for independent sequences
      expect(Math.abs(correlation)).toBeLessThan(0.05);
    });
  });
});
