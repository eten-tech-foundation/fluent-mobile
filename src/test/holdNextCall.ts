/**
 * Holds the next call to `mock` open until the returned `release` runs, then
 * settles it the way the mock's default implementation would.
 *
 * RNTL 14's `renderHook` and `rerender` are async and flush resolved reads, so a
 * test that checks a "still loading" state has to keep that read in flight
 * explicitly. Call `release` inside `act`.
 */
export function holdNextCall(mock: jest.Mock): () => void {
  const fallback = mock.getMockImplementation();
  if (!fallback) throw new Error('holdNextCall needs a default implementation');
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  mock.mockImplementationOnce((...args: unknown[]) =>
    gate.then(() => fallback(...args)),
  );
  return () => release();
}
