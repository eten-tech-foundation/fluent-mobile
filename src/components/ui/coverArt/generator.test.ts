import {
  artProgress,
  coverArtSpec,
  hash,
  pickStyle,
  rng,
  type CoverArtSpec,
  type CoverColors,
  type CoverStyle,
} from './generator';

const COLORS: CoverColors = {
  ground: '#141210',
  tone: '#24211D',
  status: ['#0B2A6B', '#0F3C99', '#1450C7', '#2B6BF0', '#4D8BFF'],
};
const STYLES: CoverStyle[] = ['mist', 'current', 'dawn'];

function colorsOf(spec: CoverArtSpec): string[] {
  return [
    ...(spec.gradient?.stops.map(s => s.color) ?? []),
    ...spec.blobs.flatMap(b => b.stops.map(s => s.color)),
  ];
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How far blue leads red and green, averaged over the cover's colours. */
function blueness(spec: CoverArtSpec): number {
  const values = colorsOf(spec).map(c => {
    const [r, g, b] = rgb(c);
    return b - (r + g) / 2;
  });
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('hash and rng', () => {
  it('give the same numbers for the same seed', () => {
    expect(hash('Mark:14')).toBe(hash('Mark:14'));
    expect(hash('Mark:14')).not.toBe(hash('Mark:15'));
    const a = rng('seed');
    const b = rng('seed');
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    first.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });
});

describe('pickStyle', () => {
  const groups = Array.from({ length: 300 }, (_, i) => `Book:${i}`);

  it('keeps a chapter on one style', () => {
    expect(pickStyle('Mark:14')).toBe(pickStyle('Mark:14'));
  });

  it('uses every style', () => {
    expect(new Set(groups.map(pickStyle))).toEqual(new Set(STYLES));
  });
});

describe('coverArtSpec', () => {
  it.each(STYLES)('draws %s the same for the same passage', style => {
    const input = { seed: 'Mark:pericope::2', progress: 0.4, style };
    expect(coverArtSpec(input, COLORS)).toEqual(coverArtSpec(input, COLORS));
    expect(coverArtSpec(input, COLORS)).not.toEqual(
      coverArtSpec({ ...input, seed: 'Mark:pericope::3' }, COLORS),
    );
  });

  it.each(STYLES)('has no blue in %s at zero progress', style => {
    const input = { seed: 'a', progress: 0, style };
    expect(coverArtSpec(input, COLORS)).toEqual(
      coverArtSpec(input, { ...COLORS, status: [] }),
    );
  });

  it.each(STYLES)('turns %s bluer as progress grows', style => {
    const at = (progress: number) =>
      blueness(coverArtSpec({ seed: 'a', progress, style }, COLORS));
    expect(at(0.3)).toBeGreaterThan(at(0));
    expect(at(0.7)).toBeGreaterThan(at(0.3));
    expect(at(1)).toBeGreaterThan(at(0.7));
  });

  it('adds finer mist past half progress', () => {
    const blobs = (progress: number) =>
      coverArtSpec({ seed: 'a', progress, style: 'mist' }, COLORS).blobs.length;
    expect(blobs(0.6)).toBeGreaterThan(blobs(0.4));
  });

  it('draws a gradient for current and dawn only', () => {
    const spec = (style: CoverStyle) =>
      coverArtSpec({ seed: 'a', progress: 0.5, style }, COLORS);
    expect(spec('mist').gradient).toBeNull();
    expect(spec('current').gradient?.from).toEqual({ x: 0.5, y: 0 });
    // Dawn runs top-left to bottom-right, so blue glows from that corner.
    expect(spec('dawn').gradient?.to.x).toBeGreaterThan(0.5);
    expect(spec('dawn').gradient?.to.y).toBeGreaterThan(0.5);
  });

  it('treats progress past the ends as none or all', () => {
    const spec = (progress: number) =>
      coverArtSpec({ seed: 'a', progress, style: 'current' }, COLORS);
    expect(spec(-1)).toEqual(spec(0));
    expect(spec(2)).toEqual(spec(1));
  });
});

describe('artProgress', () => {
  it.each(STYLES)('gives %s some blue before anything is recorded', style => {
    const at = (progress: number) =>
      blueness(coverArtSpec({ seed: 'a', progress, style }, COLORS));
    expect(at(artProgress(0))).toBeGreaterThan(at(0));
  });

  it('grows with recording and reaches full once it is all recorded', () => {
    expect(artProgress(-1)).toBe(artProgress(0));
    expect(artProgress(0.5)).toBeGreaterThan(artProgress(0));
    expect(artProgress(1)).toBeGreaterThan(artProgress(0.5));
    expect(artProgress(1)).toBe(1);
    expect(artProgress(2)).toBe(1);
  });
});
