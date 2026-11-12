/** Stretch `levels` across `max` slots. Newest stays last; nothing is dropped. */
function stretchBars(levels: number[], max: number) {
  if (max <= 1) return [levels[levels.length - 1]];
  const last = levels.length - 1;
  return Array.from(
    { length: max },
    (_, i) => levels[Math.round((i * last) / (max - 1))],
  );
}

/**
 * Fit `levels` into `max` bars. Short lists stretch so the wave fills the
 * slot (newest last). Long lists keep the newest while recording, or peak-
 * squeeze a saved take.
 */
export function fitBars(levels: number[], max: number, newest: boolean) {
  if (levels.length === 0 || max <= 0) return levels;
  if (levels.length < max) return stretchBars(levels, max);
  if (levels.length === max) return levels;
  if (newest) return levels.slice(-max);
  const per = levels.length / max;
  return Array.from({ length: max }, (_, i) =>
    Math.max(...levels.slice(Math.floor(i * per), Math.floor((i + 1) * per))),
  );
}
