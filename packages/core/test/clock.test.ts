import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VirtualClock } from '../src/clock';

describe('VirtualClock', () => {
  let clock: VirtualClock;

  beforeEach(() => {
    clock = new VirtualClock();
  });

  afterEach(() => {
    clock.uninstall();
  });

  describe('Accelerated Mode', () => {
    beforeEach(() => {
      clock.install({ mode: 'accelerated', startTime: 1000000 });
    });

    it('should hijack Date.now() and advance instantly', () => {
      expect(Date.now()).toBe(1000000);
      clock.advance(5000);
      expect(Date.now()).toBe(1005000);
    });

    it('should fire setTimeouts virtually instantly without waiting', () => {
      let fired = false;
      
      // Schedule for 60 seconds from now
      setTimeout(() => {
        fired = true;
      }, 60000);
      
      expect(fired).toBe(false);
      
      // Advance by 59s
      clock.advance(59000);
      expect(fired).toBe(false);
      
      // Advance past the trigger time
      clock.advance(1000);
      expect(fired).toBe(true);
      expect(Date.now()).toBe(1060000);
    });

    it('should fire timers in the correct order', () => {
      const executionOrder: number[] = [];

      setTimeout(() => executionOrder.push(3), 300);
      setTimeout(() => executionOrder.push(1), 100);
      setTimeout(() => executionOrder.push(2), 200);

      clock.runAll();

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should allow clearTimeout to cancel tasks', () => {
      let fired = false;
      const id = setTimeout(() => {
        fired = true;
      }, 1000);

      clearTimeout(id);
      clock.advance(2000);

      expect(fired).toBe(false);
    });

    it('should handle nested setTimeouts', () => {
      let steps = 0;

      setTimeout(() => {
        steps++;
        setTimeout(() => {
          steps++;
        }, 500);
      }, 500);

      clock.advance(499);
      expect(steps).toBe(0);
      
      clock.advance(1);
      expect(steps).toBe(1);
      
      clock.advance(500);
      expect(steps).toBe(2);
    });
  });

  describe('Fault Injection', () => {
    beforeEach(() => {
      clock.install({ mode: 'accelerated', startTime: 1000000 });
    });

    it('should apply CLOCK_SKEW without advancing timers early', () => {
      let fired = false;
      setTimeout(() => {
        fired = true;
      }, 1000);

      // Skew the clock forward by 5000ms. 
      // Date.now() should show the skewed time, but the timer shouldn't fire yet because the engine hasn't physically advanced.
      clock.applyFault({ type: 'CLOCK_SKEW', offsetMs: 5000 });
      
      expect(Date.now()).toBe(1005000); // Time is skewed
      expect(fired).toBe(false); // Timer still waiting for engine to physically advance
      
      clock.advance(1000); // Advance engine physically
      expect(fired).toBe(true);
    });

    it('should apply TIME_JUMP and fire timers within the jump window', () => {
      let fired = false;
      setTimeout(() => {
        fired = true;
      }, 1000);

      expect(fired).toBe(false);

      // A TIME_JUMP advances the physical simulation time abruptly
      clock.applyFault({ type: 'TIME_JUMP', offsetMs: 2000 });
      
      expect(Date.now()).toBe(1002000);
      expect(fired).toBe(true); // Timer triggered because we jumped over it
    });
  });
});
