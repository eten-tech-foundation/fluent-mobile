const {
  APK_SCHEDULE_CRON,
  SLACK_SCHEDULE_CRON,
  isBuildWindowHour,
  isSlackHoursHour,
  resolveWindows,
} = require('./nightly-windows.cjs');

describe('nightly-windows', () => {
  it('treats 22–02 Pacific as the overnight build window', () => {
    expect([22, 23, 0, 1, 2].every(isBuildWindowHour)).toBe(true);
    expect(isBuildWindowHour(11)).toBe(false);
    expect(isBuildWindowHour(9)).toBe(false);
  });

  it('treats 09–16 Pacific as Slack hours (no overnight wake-up ping)', () => {
    expect(isSlackHoursHour(8)).toBe(false);
    expect(isSlackHoursHour(9)).toBe(true);
    expect(isSlackHoursHour(16)).toBe(true);
    expect(isSlackHoursHour(17)).toBe(false);
    expect(isSlackHoursHour(23)).toBe(false);
  });

  it('always allows non-schedule triggers to build', () => {
    const now = new Date('2026-08-28T18:07:00Z'); // 11:07 PDT
    const dispatch = resolveWindows({
      eventName: 'workflow_dispatch',
      now,
    });
    expect(dispatch.inBuildWindow).toBe(true);
    expect(dispatch.inSlackHours).toBe(true);
  });

  it('rejects unknown late-morning schedule fires without an APK cron id', () => {
    const now = new Date('2026-08-28T18:07:00Z'); // 11:07 PDT
    const scheduled = resolveWindows({ eventName: 'schedule', now });
    expect(scheduled.hourPt).toBe(11);
    expect(scheduled.inBuildWindow).toBe(false);
    expect(scheduled.inSlackHours).toBe(true);
  });

  it('allows the 23:17 PT cron hour to build without Slack', () => {
    const now = new Date('2026-08-29T06:17:00Z'); // 23:17 PDT
    const scheduled = resolveWindows({
      eventName: 'schedule',
      scheduleCron: APK_SCHEDULE_CRON,
      now,
    });
    expect(scheduled.hourPt).toBe(23);
    expect(scheduled.inBuildWindow).toBe(true);
    expect(scheduled.inSlackHours).toBe(false);
  });

  it('allows a delayed APK cron fire after 02:00 PT (GitHub schedule lag)', () => {
    // Observed pattern after #421: ~23:17 PT cron lands ~05:43 PT next day.
    const now = new Date('2026-09-07T12:43:01Z'); // 05:43 PDT
    const delayed = resolveWindows({
      eventName: 'schedule',
      scheduleCron: APK_SCHEDULE_CRON,
      now,
    });
    expect(delayed.hourPt).toBe(5);
    expect(delayed.inBuildWindow).toBe(true);
    expect(delayed.inSlackHours).toBe(false);
  });

  it('never treats the morning Slack cron as an APK build window', () => {
    const now = new Date('2026-09-07T16:07:00Z'); // 09:07 PDT
    const slackSlot = resolveWindows({
      eventName: 'schedule',
      scheduleCron: SLACK_SCHEDULE_CRON,
      now,
    });
    expect(slackSlot.inBuildWindow).toBe(false);
    expect(slackSlot.inSlackHours).toBe(true);
  });
});
