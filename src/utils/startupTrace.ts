import { isStartupTraceEnabled } from '../config/startupTrace';

/**
 * Cold-start milestones, in the order a returning user meets them. Each is
 * recorded once per JS runtime; a second call (an account switch remounting
 * Home, a later sync) is ignored so the trace stays a launch trace.
 */
export type StartupMark =
  | 'js_entry'
  | 'db_open'
  | 'migrations_done'
  | 'paused_takes_cleared'
  | 'session_restored'
  | 'splash_hide_requested'
  | 'splash_hidden'
  | 'home_mount'
  | 'chapters_read'
  | 'books_read'
  | 'first_content_commit'
  | 'nextup_ready'
  | 'health_resolved'
  | 'metadata_refresh_complete'
  | 'tier1_complete';

export interface StartupMarkRecord {
  name: StartupMark;
  /** Milliseconds since `js_entry` (this module's evaluation). */
  sinceEntryMs: number;
  /** Raw monotonic clock reading, for aligning with native launch timing. */
  monotonicMs: number;
  /** Wall clock, for aligning with `logcat` and `am start -W` output. */
  wallMs: number;
  context?: Record<string, string | number | boolean | null>;
}

type MonotonicClock = () => number;

function defaultMonotonicClock(): number {
  const perf = (globalThis as { performance?: { now?: () => number } })
    .performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

let monotonicNow: MonotonicClock = defaultMonotonicClock;
let wallNow: () => number = () => Date.now();
let entryMonotonicMs = monotonicNow();
const marks: StartupMarkRecord[] = [];
const seen = new Set<StartupMark>();

function emit(record: StartupMarkRecord): void {
  if (!isStartupTraceEnabled()) return;
  const context = record.context ? ` ${JSON.stringify(record.context)}` : '';
  // The development logger drops everything in a release build; this line is
  // the only output a measured release APK has, so it bypasses it on purpose.
  // eslint-disable-next-line no-console
  console.log(
    `[StartupTrace] ${record.name} t=${record.sinceEntryMs.toFixed(
      1,
    )}ms mono=${record.monotonicMs.toFixed(1)} wall=${record.wallMs}${context}`,
  );
}

/**
 * Records a launch milestone the first time it is reached. Context must stay
 * free of tokens, emails and text content; counts and kinds only.
 */
export function markStartup(
  name: StartupMark,
  context?: StartupMarkRecord['context'],
): void {
  if (seen.has(name)) return;
  seen.add(name);
  const monotonicMs = monotonicNow();
  const record: StartupMarkRecord = {
    name,
    sinceEntryMs: monotonicMs - entryMonotonicMs,
    monotonicMs,
    wallMs: wallNow(),
    context,
  };
  marks.push(record);
  emit(record);
}

/** Marks recorded so far, in order. */
export function getStartupMarks(): readonly StartupMarkRecord[] {
  return marks;
}

export function hasStartupMark(name: StartupMark): boolean {
  return seen.has(name);
}

/** Tests only: clear recorded marks and optionally substitute the clocks. */
export function resetStartupTraceForTests(clocks?: {
  monotonic?: MonotonicClock;
  wall?: () => number;
}): void {
  monotonicNow = clocks?.monotonic ?? defaultMonotonicClock;
  wallNow = clocks?.wall ?? (() => Date.now());
  entryMonotonicMs = monotonicNow();
  marks.length = 0;
  seen.clear();
  markStartup('js_entry');
}

markStartup('js_entry');
