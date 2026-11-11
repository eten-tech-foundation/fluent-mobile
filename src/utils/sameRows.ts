/**
 * Whether two lists of flat rows (scalar fields only) hold the same values in
 * the same order. Lets a re-read keep the list already on screen, so nothing
 * downstream re-renders or recomputes when the data didn't change.
 */
export function sameRows<T extends object>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i] as Record<string, unknown>;
    const fields = row as Record<string, unknown>;
    const keys = Object.keys(fields);
    return (
      keys.length === Object.keys(other).length &&
      keys.every(key => Object.is(fields[key], other[key]))
    );
  });
}
