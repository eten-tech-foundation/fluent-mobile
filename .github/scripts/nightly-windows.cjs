/**
 * Pacific time windows for nightly preview.
 * Build cron: `17 23 * * *` America/Los_Angeles (intended ~23:17 PT).
 * Slack cron: `7 9 * * *` America/Los_Angeles (intended ~09:07 PT).
 *
 * GitHub often delays schedule fires by several hours. Trust
 * `github.event.schedule` (cron identity) for the APK slot so a delayed
 * 23:17 PT fire that lands at ~04–06 PT still builds. Wall-clock
 * 22:00–02:00 PT remains only for unknown / legacy schedule strings.
 * Slack: 09:00–16:00 America/Los_Angeles (incoming webhooks cannot mute push).
 */

const TIME_ZONE = 'America/Los_Angeles';

/** Cron string for the overnight APK job (must match nightly-preview.yml). */
const APK_SCHEDULE_CRON = '17 23 * * *';

/** Cron string for the morning Slack delivery job. */
const SLACK_SCHEDULE_CRON = '7 9 * * *';

function pacificHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
}

function isBuildWindowHour(hour) {
  return hour === 22 || hour === 23 || hour === 0 || hour === 1 || hour === 2;
}

function isSlackHoursHour(hour) {
  return hour >= 9 && hour <= 16;
}

function resolveWindows({
  eventName = '',
  scheduleCron = '',
  now = new Date(),
} = {}) {
  const hourPt = pacificHour(now);
  const isSchedule = eventName === 'schedule';
  const cron = String(scheduleCron || '').trim();

  let inBuildWindow;
  if (!isSchedule) {
    // workflow_dispatch / pull_request — always allow the APK path.
    inBuildWindow = true;
  } else if (cron === APK_SCHEDULE_CRON) {
    // Authoritative APK slot even when GitHub delays past 02:00 PT.
    inBuildWindow = true;
  } else if (cron === SLACK_SCHEDULE_CRON) {
    // Morning Slack-only slot (APK job is skipped at the job `if` anyway).
    inBuildWindow = false;
  } else {
    // Unknown / legacy schedules — keep the narrow wall-clock guard so an
    // old drifted ~11am PT fire cannot rebuild after a cron re-register.
    inBuildWindow = isBuildWindowHour(hourPt);
  }

  return {
    hourPt,
    inBuildWindow,
    inSlackHours: isSlackHoursHour(hourPt),
  };
}

function printGithubOutput(env = process.env) {
  const { hourPt, inBuildWindow, inSlackHours } = resolveWindows({
    eventName: env.GITHUB_EVENT_NAME || '',
    scheduleCron: env.GITHUB_EVENT_SCHEDULE || '',
  });
  const lines = [
    `hour_pt=${hourPt}`,
    `in_window=${inBuildWindow}`,
    `in_slack_hours=${inSlackHours}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return { hourPt, inBuildWindow, inSlackHours };
}

module.exports = {
  TIME_ZONE,
  APK_SCHEDULE_CRON,
  SLACK_SCHEDULE_CRON,
  pacificHour,
  isBuildWindowHour,
  isSlackHoursHour,
  resolveWindows,
  printGithubOutput,
};

if (require.main === module) {
  printGithubOutput();
}
