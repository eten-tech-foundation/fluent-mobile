/**
 * Intentional ESLint violation fixture (#366). Ignored by default lint;
 * exercised by scripts/eslint-layer-boundaries.test.cjs.
 */
export async function badUiFetch(): Promise<void> {
  await fetch('https://example.com');
  await globalThis.fetch('https://example.com');
}
