import { useEffect, useState } from 'react';
import { onSyncComplete, onSyncStart } from '../services/syncEvents';
import { isMetadataSyncActive } from '../services/sync';

/**
 * True while a full sync or a focus light refresh is in flight, whichever
 * surface started it — not only the one this screen started (#886).
 * Standalone `syncStart` emitters outside those two (source-language ensure,
 * master-data backfill) are not tracked.
 *
 * Samples the sync module's own in-flight state on mount and on every
 * `syncStart` / `syncComplete`, so a consumer that mounts mid-sync, or a
 * light refresh that only emits `syncComplete`, still resolves to the truth.
 * `syncComplete` for a full sync fires before the single-flight entry is
 * released, so each event is sampled again on the next macrotask.
 */
export function useMetadataSyncActive(): boolean {
  const [active, setActive] = useState(isMetadataSyncActive);

  useEffect(() => {
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const sample = () => {
      if (!cancelled) setActive(isMetadataSyncActive());
    };
    const sampleNowAndSettled = () => {
      sample();
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        sample();
      }, 0);
    };
    sample();
    const unsubStart = onSyncStart(sampleNowAndSettled);
    const unsubComplete = onSyncComplete(sampleNowAndSettled);
    return () => {
      cancelled = true;
      if (pending) clearTimeout(pending);
      unsubStart();
      unsubComplete();
    };
  }, []);

  return active;
}
