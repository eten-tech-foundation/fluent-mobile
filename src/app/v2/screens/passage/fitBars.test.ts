import { fitBars } from './fitBars';

describe('fitBars', () => {
  it('keeps every level when they fit', () => {
    expect(fitBars([0.1, 0.5], 4, true)).toEqual([0.1, 0.5]);
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
