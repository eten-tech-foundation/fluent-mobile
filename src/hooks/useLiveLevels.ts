import { useEffect, useRef, useState } from 'react';

/** The Level wave's sample rate. */
const SAMPLE_MS = 100;
/**
 * Bars kept for each saved take. Once full, bars merge in pairs and the
 * stride doubles, so finished bars cover equal stretches; the open bar can
 * add one.
 */
export const LEVEL_ENVELOPE_BARS = 240;
/** Newest samples on the recording card. Tuned separately from the saved envelope. */
export const LIVE_LEVEL_BARS = 240;

/** Finished bars share `stride` samples; `filled` counts samples in the open bar. */
export type LevelEnvelope = {
  bars: number[];
  stride: number;
  partial: number;
  filled: number;
};

export function emptyLevelEnvelope(): LevelEnvelope {
  return { bars: [], stride: 1, partial: 0, filled: 0 };
}

function mergePairs(bars: readonly number[]): number[] {
  const next = new Array<number>(bars.length / 2);
  for (let i = 0; i < bars.length; i += 2) {
    next[i / 2] = Math.max(bars[i] ?? 0, bars[i + 1] ?? 0);
  }
  return next;
}

/**
 * One more sample. Finished bars always cover `stride` samples each.
 * When the envelope is full, those bars collapse together and the stride
 * doubles, so the new sample starts the next equal bar instead of a short one.
 */
export function pushLevel(env: LevelEnvelope, level: number): LevelEnvelope {
  const partial = Math.max(env.partial, level);
  const filled = env.filled + 1;
  if (filled < env.stride) {
    return { bars: env.bars, stride: env.stride, partial, filled };
  }
  if (env.bars.length === LEVEL_ENVELOPE_BARS) {
    return {
      bars: mergePairs(env.bars),
      stride: env.stride * 2,
      partial,
      filled: env.stride,
    };
  }
  return {
    bars: env.bars.concat(partial),
    stride: env.stride,
    partial: 0,
    filled: 0,
  };
}

/** Finished bars, plus the open bar once it has a sample. */
export function levelsFromEnvelope(env: LevelEnvelope): number[] {
  return env.filled > 0 ? env.bars.concat(env.partial) : env.bars;
}
/**
 * Mic hiss and a quiet room sit well above -55 dBFS, and a straight map from
 * there paints silence as tall bars. Only the top of the range counts, and
 * squaring it keeps that quiet end thin while voice still fills the wave.
 */
const FLOOR_DB = -32;

/** dBFS from the recorder to a 0–1 Level wave height. */
export function levelFromDb(db: number | null): number {
  if (db === null || !Number.isFinite(db)) return 0;
  const linear = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
  return linear * linear;
}

/** Keep the newest samples, one bar each, dropping the oldest past the cap. */
function pushLive(prev: readonly number[], level: number): number[] {
  if (prev.length < LIVE_LEVEL_BARS) {
    return prev.length === 0 ? [level] : prev.concat(level);
  }
  const next = prev.slice(1);
  next.push(level);
  return next;
}

/**
 * Samples the mic level once per 100ms while `sampling`. `live` is the
 * newest samples, one bar per sample, for the recording card. `envelope` is
 * the whole take, for review after save. A new take (`capturing` turning on)
 * starts both fresh; pausing keeps them.
 */
export function useLiveLevels(
  getMetering: () => number | null,
  capturing: boolean,
  sampling: boolean,
): { live: number[]; envelope: number[] } {
  const [live, setLive] = useState<number[]>([]);
  const [envelope, setEnvelope] = useState<number[]>([]);
  const envRef = useRef(emptyLevelEnvelope());
  const getRef = useRef(getMetering);
  getRef.current = getMetering;

  useEffect(() => {
    if (!capturing) return;
    envRef.current = emptyLevelEnvelope();
    setLive([]);
    setEnvelope([]);
  }, [capturing]);

  useEffect(() => {
    if (!sampling) return;
    const timer = setInterval(() => {
      const level = levelFromDb(getRef.current());
      envRef.current = pushLevel(envRef.current, level);
      setLive(prev => pushLive(prev, level));
      setEnvelope(levelsFromEnvelope(envRef.current));
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [sampling]);

  return { live, envelope };
}
