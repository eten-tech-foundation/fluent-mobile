/** Thin playback surface for #96 — no storage, DB, or waveform library deps. */
export type PlayerStatus = 'idle' | 'playing' | 'paused';

export type PlayerApi = {
  status: PlayerStatus;
  positionMs: number;
  durationMs: number;
  /** Prepare URI for seek/play without starting playback (Review scrub). */
  load(uri: string): Promise<void>;
  play(uri: string): Promise<void>;
  pause(): Promise<void>;
  seek(ms: number): Promise<void>;
  stop(): Promise<void>;
};
