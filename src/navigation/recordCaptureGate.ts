/**
 * Cross-tree gate for an in-progress record take (recording or paused).
 * Drafting publishes; the root drawer and settings menu subscribe so swipe /
 * drawer navigation cannot discard a take (#568).
 */

type Listener = (active: boolean) => void;

let captureActive = false;
const listeners = new Set<Listener>();

export const RECORDING_IN_PROGRESS_TITLE = 'Recording in progress';
export const RECORDING_IN_PROGRESS_MESSAGE =
  'Stop or finish the current take before leaving.';

export function getRecordCaptureGate(): boolean {
  return captureActive;
}

export function setRecordCaptureGate(active: boolean): void {
  if (captureActive === active) {
    return;
  }
  captureActive = active;
  listeners.forEach(fn => fn(active));
}

export function subscribeRecordCaptureGate(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Reset between Jest cases that mutate the module singleton. */
export function resetRecordCaptureGateForTests(): void {
  captureActive = false;
  listeners.clear();
}
