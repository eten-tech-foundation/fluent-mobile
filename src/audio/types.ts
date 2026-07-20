/** Thin recorder surface for #95 — no storage, DB, or UI side effects. */
export type RecorderStatus = 'idle' | 'recording' | 'paused';

export type MicPermissionResult = 'granted' | 'denied' | 'undetermined';

export type StopResult = {
  uri: string;
  durationMs: number;
};

export type RecorderApi = {
  status: RecorderStatus;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<StopResult>;
};
