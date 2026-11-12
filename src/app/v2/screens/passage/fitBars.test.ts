import { fitBars } from './fitBars';

describe('fitBars', () => {
  it('spreads a short take across the slot, newest last', () => {
    const bars = fitBars([0.2, 0.8], 5, true);
    expect(bars).toHaveLength(5);
    expect(bars[0]).toBe(0.2);
    expect(bars[4]).toBe(0.8);
    expect(bars).toContain(0.2);
    expect(bars).toContain(0.8);
  });

  it('spreads a saved short take the same way', () => {
    const bars = fitBars([0.2, 0.8], 5, false);
    expect(bars).toHaveLength(5);
    expect(bars[0]).toBe(0.2);
    expect(bars[4]).toBe(0.8);
  });

  it('keeps a single sample across the whole slot', () => {
    expect(fitBars([0.4], 4, true)).toEqual([0.4, 0.4, 0.4, 0.4]);
  });

  it('keeps the newest levels while recording', () => {
    expect(fitBars([0.1, 0.2, 0.3, 0.4, 0.5], 2, true)).toEqual([0.4, 0.5]);
  });

  it("squeezes a saved take to fit, keeping each stretch's peak", () => {
    expect(fitBars([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3, false)).toEqual([
      0.9, 0.3, 0.8,
    ]);
  });
});
