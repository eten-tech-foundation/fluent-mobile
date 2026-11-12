import { verseChipWidth } from './VerseChip';
import type { WaveformVerse } from './Waveform';

/** Waveform's bar width. A bar plus the xs gap is one slot. */
const BAR_WIDTH = 2;

/**
 * Spread a short listen wave across `frameWidth`. A wave that already fills
 * the row is left alone, so a long chapter still scrolls.
 */
export function fillShortWave(
  verses: readonly WaveformVerse[],
  frameWidth: number,
  spacing: { xs: number; md: number },
): WaveformVerse[] {
  if (frameWidth <= 0) return [...verses];
  const gap = verses.every(v => v.verse === null) ? spacing.xs : spacing.md;
  const width = visualWidth(verses, gap, spacing.xs);
  if (width <= 0 || width >= frameWidth) return [...verses];
  const extra = Math.floor((frameWidth - width) / (BAR_WIDTH + spacing.xs));
  if (extra <= 0) return [...verses];
  const added = share(
    extra,
    verses.map(v => v.bars.length),
  );
  return verses.map((v, i) =>
    added[i] > 0
      ? { ...v, bars: stretch(v.bars, v.bars.length + added[i]) }
      : v,
  );
}

function visualWidth(
  verses: readonly WaveformVerse[],
  gap: number,
  xs: number,
): number {
  let width = 0;
  let children = 0;
  const push = (child: number) => {
    if (children > 0) width += gap;
    width += child;
    children += 1;
  };
  for (const v of verses) {
    if (v.verse !== null) push(verseChipWidth(v.verse));
    if (v.bars.length > 0) {
      push(v.bars.length * BAR_WIDTH + (v.bars.length - 1) * xs);
    }
  }
  return width;
}

/** Hand out `extra` slots in proportion to each verse's bars. */
function share(extra: number, weights: number[]): number[] {
  const total = weights.reduce((sum, n) => sum + n, 0);
  if (extra <= 0 || total <= 0) return weights.map(() => 0);
  const base = weights.map(n => Math.floor((extra * n) / total));
  let left = extra - base.reduce((sum, n) => sum + n, 0);
  const order = weights
    .map((n, i) => ({ i, frac: (extra * n) / total - base[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left === 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
}

function stretch(levels: readonly number[], max: number): number[] {
  if (max <= 1) return [levels[levels.length - 1]];
  const last = levels.length - 1;
  return Array.from(
    { length: max },
    (_, i) => levels[Math.round((i * last) / (max - 1))],
  );
}
