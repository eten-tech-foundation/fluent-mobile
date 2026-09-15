/**
 * Schedule identity for nightly preview.
 * Cron: `17 15 * * *` America/Los_Angeles (intended ~15:17 PT / ~16:17 MT).
 *
 * Target after typical GitHub schedule lag (~3–5h): late evening Mountain /
 * early India morning (~06:30–09:00 IST). GitHub delay is expected — docs and
 * this comment state the intended local time, not a guarantee.
 *
 * Trust `github.event.schedule` (cron identity) so a delayed fire still builds.
 * Unknown / legacy cron strings are ignored (no APK, no Slack) so re-registers
 * and leftover dual-cron fires from #421 do not rebuild.
 *
 * Slack posts in the same workflow run as the build/skip outcome (#484) —
 * no quiet-hours hold or morning delivery job.
 */

const TIME_ZONE = 'America/Los_Angeles';

/** Cron string for the nightly APK + Slack job (must match nightly-preview.yml). */
const NIGHTLY_SCHEDULE_CRON = '17 15 * * *';

function pacificHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour);
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
  } else if (cron === NIGHTLY_SCHEDULE_CRON) {
    // Authoritative nightly slot even when GitHub delays the fire.
    inBuildWindow = true;
  } else {
    // Unknown / legacy schedules (including removed dual-cron strings) — no-op.
    inBuildWindow = false;
  }

  return {
    hourPt,
    inBuildWindow,
  };
}

function printGithubOutput(env = process.env) {
  const { hourPt, inBuildWindow } = resolveWindows({
    eventName: env.GITHUB_EVENT_NAME || '',
    scheduleCron: env.GITHUB_EVENT_SCHEDULE || '',
  });
  const lines = [`hour_pt=${hourPt}`, `in_window=${inBuildWindow}`];
  process.stdout.write(`${lines.join('\n')}\n`);
  return { hourPt, inBuildWindow };
}

module.exports = {
  TIME_ZONE,
  NIGHTLY_SCHEDULE_CRON,
  pacificHour,
  resolveWindows,
  printGithubOutput,
};

if (require.main === module) {
  printGithubOutput();
}
