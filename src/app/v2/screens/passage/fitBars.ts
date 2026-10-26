/** The newest `max` levels, or all of them squeezed to `max` by peak. */
export function fitBars(levels: number[], max: number, newest: boolean) {
  if (levels.length <= max) return levels;
  if (newest) return levels.slice(-max);
  const per = levels.length / max;
  return Array.from({ length: max }, (_, i) =>
    Math.max(...levels.slice(Math.floor(i * per), Math.floor((i + 1) * per))),
  );
}
