import { useEffect, useRef, useState } from 'react';

/** The Level wave's sample rate. */
const SAMPLE_MS = 100;
/** Below this is room tone; speech mostly sits between it and 0 dBFS. */
const FLOOR_DB = -55;

/** dBFS from the recorder to a 0–1 Level wave height. */
export function levelFromDb(db: number | null): number {
  if (db === null || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
}

/**
 * Samples the mic level once per 100ms while `sampling`, for the long Level
 * wave. A new take (`capturing` turning on) starts fresh levels; pausing keeps
 * them, and they stay after the take stops.
 */
export function useLiveLevels(
  getMetering: () => number | null,
  capturing: boolean,
  sampling: boolean,
): number[] {
  const [levels, setLevels] = useState<number[]>([]);
  const getRef = useRef(getMetering);
  getRef.current = getMetering;

  useEffect(() => {
    if (capturing) setLevels([]);
  }, [capturing]);

  useEffect(() => {
    if (!sampling) return;
    const timer = setInterval(() => {
      const level = levelFromDb(getRef.current());
      setLevels(prev => [...prev, level]);
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [sampling]);

  return levels;
}
