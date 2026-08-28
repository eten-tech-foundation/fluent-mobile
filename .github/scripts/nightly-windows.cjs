/**
 * Pacific time windows for nightly preview.
 * Build: 22:00–02:00 America/Los_Angeles (cron 23:17 PT).
 * Slack: 09:00–16:00 America/Los_Angeles (incoming webhooks cannot mute push).
 */

const TIME_ZONE = 'America/Los_Angeles';

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
  now = new Date(),
} = {}) {
  const hourPt = pacificHour(now);
  const isSchedule = eventName === 'schedule';
  return {
    hourPt,
    inBuildWindow: !isSchedule || isBuildWindowHour(hourPt),
    inSlackHours: isSlackHoursHour(hourPt),
  };
}

function printGithubOutput(env = process.env) {
  const { hourPt, inBuildWindow, inSlackHours } = resolveWindows({
    eventName: env.GITHUB_EVENT_NAME || '',
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
  pacificHour,
  isBuildWindowHour,
  isSlackHoursHour,
  resolveWindows,
  printGithubOutput,
};

if (require.main === module) {
  printGithubOutput();
}
