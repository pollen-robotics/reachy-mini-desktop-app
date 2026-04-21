import { describe, it, expect } from 'vitest';
import { getDoADirection, doaToCssRotation } from '../useDoA';

// Test cases below encode the contract documented in the JSDoc of
// `getDoADirection` and `doaToCssRotation`, NOT the current implementation:
//
//   - 0 rad   = left
//   - π/2 rad = front
//   - π rad   = right
//   - null    = 'unknown' / 0deg
//
// The 5 bucket labels (left | front-left | front | front-right | right) are
// tested through their documented anchors and through a monotonic ordering
// invariant, not through their internal bucket boundaries.

describe('getDoADirection - documented contract', () => {
  describe('anchor points from JSDoc', () => {
    it('returns "unknown" when angle is null', () => {
      expect(getDoADirection(null)).toBe('unknown');
    });

    it('returns "left" for 0 rad', () => {
      expect(getDoADirection(0)).toBe('left');
    });

    it('returns "front" for π/2 rad', () => {
      expect(getDoADirection(Math.PI / 2)).toBe('front');
    });

    // Regression: bug-15 fix (π used to be collapsed to 0 by `% π` and
    // return 'left' instead of 'right'). This test must stay green.
    it('returns "right" for exactly π rad', () => {
      expect(getDoADirection(Math.PI)).toBe('right');
    });
  });

  describe('monotonic progression left→right as angle sweeps 0→π', () => {
    // As the angle grows from 0 to π the label must never move backwards in
    // the canonical sequence. This catches modulo / clamp regressions without
    // pinning down the exact bucket boundaries, which are an implementation
    // detail not documented in the JSDoc.
    const order = ['left', 'front-left', 'front', 'front-right', 'right'];
    const samples = [
      0,
      Math.PI / 8,
      Math.PI / 4,
      Math.PI / 3,
      Math.PI / 2,
      (2 * Math.PI) / 3,
      (3 * Math.PI) / 4,
      (7 * Math.PI) / 8,
      Math.PI,
    ];

    it('always returns one of the 5 documented labels', () => {
      for (const a of samples) {
        expect(order).toContain(getDoADirection(a));
      }
    });

    it('never moves backwards in the label sequence', () => {
      const indices = samples.map(a => order.indexOf(getDoADirection(a)));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
      }
    });

    it('reaches both ends of the sequence', () => {
      const labels = samples.map(a => getDoADirection(a));
      expect(labels[0]).toBe('left');
      expect(labels[labels.length - 1]).toBe('right');
    });
  });

  describe('edge cases (beyond documented range)', () => {
    // The JSDoc says DoA is in [0, π] but real-world inputs might drift
    // slightly outside. The function should degrade gracefully.

    it('clamps values beyond +π to the "right" endpoint', () => {
      expect(getDoADirection(Math.PI + 0.5)).toBe('right');
    });

    it('treats -π/2 as equivalent to π/2 (front) by symmetry', () => {
      expect(getDoADirection(-Math.PI / 2)).toBe('front');
    });

    it('treats -π as equivalent to π (right)', () => {
      expect(getDoADirection(-Math.PI)).toBe('right');
    });
  });
});

describe('doaToCssRotation - documented contract', () => {
  // JSDoc: 0 rad → -90deg (left), π/2 rad → 0deg (front), π rad → 90deg
  // (right). Null → 0.

  it('returns 0 for null angle', () => {
    expect(doaToCssRotation(null)).toBe(0);
  });

  it('maps 0 rad to -90deg (left)', () => {
    expect(doaToCssRotation(0)).toBe(-90);
  });

  it('maps π/2 rad to 0deg (front)', () => {
    expect(doaToCssRotation(Math.PI / 2)).toBe(0);
  });

  it('maps π rad to 90deg (right)', () => {
    expect(doaToCssRotation(Math.PI)).toBe(90);
  });

  it('is linear between the 3 anchors', () => {
    // If the mapping is a straight line through (0, -90) and (π, 90), then
    // intermediate values must fall exactly on that line.
    expect(doaToCssRotation(Math.PI / 4)).toBeCloseTo(-45, 5);
    expect(doaToCssRotation((3 * Math.PI) / 4)).toBeCloseTo(45, 5);
  });
});
