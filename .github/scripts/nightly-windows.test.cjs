const {
  NIGHTLY_SCHEDULE_CRON,
  resolveWindows,
} = require('./nightly-windows.cjs');

describe('nightly-windows', () => {
  it('exports the single nightly cron string', () => {
    expect(NIGHTLY_SCHEDULE_CRON).toBe('17 15 * * *');
  });

  it('always allows non-schedule triggers to build', () => {
    const now = new Date('2026-08-28T18:07:00Z'); // 11:07 PDT
    const dispatch = resolveWindows({
      eventName: 'workflow_dispatch',
      now,
    });
    expect(dispatch.inBuildWindow).toBe(true);
  });

  it('rejects unknown schedule fires without the nightly cron id', () => {
    const now = new Date('2026-08-28T18:07:00Z'); // 11:07 PDT
    const scheduled = resolveWindows({ eventName: 'schedule', now });
    expect(scheduled.hourPt).toBe(11);
    expect(scheduled.inBuildWindow).toBe(false);
  });

  it('allows the 15:17 PT cron hour to build', () => {
    const now = new Date('2026-09-11T22:17:00Z'); // 15:17 PDT
    const scheduled = resolveWindows({
      eventName: 'schedule',
      scheduleCron: NIGHTLY_SCHEDULE_CRON,
      now,
    });
    expect(scheduled.hourPt).toBe(15);
    expect(scheduled.inBuildWindow).toBe(true);
  });

  it('allows a delayed nightly cron fire after intended hour (GitHub lag)', () => {
    // Intended ~15:17 PT; with ~5h lag lands ~20:17 PT (~08:47 IST).
    const now = new Date('2026-09-12T03:17:00Z'); // 20:17 PDT
    const delayed = resolveWindows({
      eventName: 'schedule',
      scheduleCron: NIGHTLY_SCHEDULE_CRON,
      now,
    });
    expect(delayed.hourPt).toBe(20);
    expect(delayed.inBuildWindow).toBe(true);
  });

  it('ignores legacy dual-cron strings after #484 simplify', () => {
    const morning = new Date('2026-09-07T16:07:00Z'); // 09:07 PDT
    const legacySlack = resolveWindows({
      eventName: 'schedule',
      scheduleCron: '7 9 * * *',
      now: morning,
    });
    expect(legacySlack.inBuildWindow).toBe(false);

    const overnight = new Date('2026-09-07T12:43:01Z'); // 05:43 PDT
    const legacyApk = resolveWindows({
      eventName: 'schedule',
      scheduleCron: '17 23 * * *',
      now: overnight,
    });
    expect(legacyApk.inBuildWindow).toBe(false);
  });
});
