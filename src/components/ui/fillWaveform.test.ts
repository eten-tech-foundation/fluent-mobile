import { fillShortWave } from './fillWaveform';

const spacing = { xs: 4, md: 12 };

describe('fillShortWave', () => {
  it('repeats a short verse until the row is full', () => {
    const filled = fillShortWave([{ verse: 1, bars: [10, 30] }], 200, spacing);
    expect(filled[0].bars.length).toBeGreaterThan(2);
    expect(filled[0].bars[0]).toBe(10);
    expect(filled[0].bars.at(-1)).toBe(30);
  });

  it('leaves a wave that already fills the row', () => {
    const bars = Array.from({ length: 80 }, (_, i) => i);
    const source = [{ verse: null, bars }];
    expect(fillShortWave(source, 200, spacing)).toEqual(source);
  });

  it('returns the source before the row is measured', () => {
    const source = [{ verse: 1, bars: [10] }];
    expect(fillShortWave(source, 0, spacing)).toEqual(source);
  });
});
