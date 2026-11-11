import {
  getStartupMarks,
  hasStartupMark,
  markStartup,
  resetStartupTraceForTests,
} from './startupTrace';

describe('startupTrace', () => {
  const original = process.env.EXPO_PUBLIC_STARTUP_TRACE;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_STARTUP_TRACE;
    } else {
      process.env.EXPO_PUBLIC_STARTUP_TRACE = original;
    }
    resetStartupTraceForTests();
  });

  it('records js_entry at reset and measures later marks from it', () => {
    let now = 1000;
    resetStartupTraceForTests({ monotonic: () => now, wall: () => 5 });
    now = 1250.5;
    markStartup('db_open');
    expect(getStartupMarks()).toEqual([
      expect.objectContaining({ name: 'js_entry', sinceEntryMs: 0 }),
      expect.objectContaining({
        name: 'db_open',
        sinceEntryMs: 250.5,
        monotonicMs: 1250.5,
        wallMs: 5,
      }),
    ]);
  });

  it('keeps only the first occurrence of a mark', () => {
    let now = 0;
    resetStartupTraceForTests({ monotonic: () => now });
    now = 10;
    markStartup('home_mount', { kind: 'first' });
    now = 20;
    markStartup('home_mount', { kind: 'second' });
    const homeMarks = getStartupMarks().filter(m => m.name === 'home_mount');
    expect(homeMarks).toHaveLength(1);
    expect(homeMarks[0]).toMatchObject({
      sinceEntryMs: 10,
      context: { kind: 'first' },
    });
    expect(hasStartupMark('home_mount')).toBe(true);
    expect(hasStartupMark('books_read')).toBe(false);
  });

  it('is silent unless EXPO_PUBLIC_STARTUP_TRACE is on', () => {
    delete process.env.EXPO_PUBLIC_STARTUP_TRACE;
    resetStartupTraceForTests();
    markStartup('db_open');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs one line per mark when the flag is on', () => {
    process.env.EXPO_PUBLIC_STARTUP_TRACE = '1';
    let now = 0;
    resetStartupTraceForTests({ monotonic: () => now, wall: () => 42 });
    now = 123.45;
    markStartup('first_content_commit', { kind: 'content', chapters: 3 });
    const lines = logSpy.mock.calls.map(call => String(call[0]));
    expect(lines).toEqual([
      '[StartupTrace] js_entry t=0.0ms mono=0.0 wall=42',
      '[StartupTrace] first_content_commit t=123.5ms mono=123.5 wall=42 {"kind":"content","chapters":3}',
    ]);
  });
});
