/**
 * Jest mock for `expo-audio` — API surface aligned with SDK 56
 * (`record` / `pause` / `stop`, `play` / `seekTo`, permission helpers).
 */

export type RecordingStatus = {
  isRecording: boolean;
  durationMillis: number;
  canRecord: boolean;
};

export type PlaybackStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  durationMillis: number;
  positionMillis: number;
};

type PermissionResponse = {
  granted: boolean;
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
};

let recordingStatus: RecordingStatus = {
  isRecording: false,
  durationMillis: 0,
  canRecord: true,
};

let playbackStatus: PlaybackStatus = {
  isLoaded: false,
  isPlaying: false,
  durationMillis: 0,
  positionMillis: 0,
};

let recordingUri: string | null = null;
let permission: PermissionResponse = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
};
let statusListener: ((status: RecordingStatus) => void) | null = null;
let playbackListener: ((status: PlaybackStatus) => void) | null = null;

export function resetAudioMock(): void {
  recordingStatus = {
    isRecording: false,
    durationMillis: 0,
    canRecord: true,
  };
  playbackStatus = {
    isLoaded: false,
    isPlaying: false,
    durationMillis: 0,
    positionMillis: 0,
  };
  recordingUri = null;
  permission = { granted: true, status: 'granted', canAskAgain: true };
  statusListener = null;
  playbackListener = null;
}

export function __setRecordingStatus(status: Partial<RecordingStatus>): void {
  recordingStatus = { ...recordingStatus, ...status };
  statusListener?.(recordingStatus);
}

export function __setPlaybackStatus(status: Partial<PlaybackStatus>): void {
  playbackStatus = { ...playbackStatus, ...status };
  playbackListener?.(playbackStatus);
}

export function __setPermission(next: Partial<PermissionResponse>): void {
  permission = { ...permission, ...next };
}

export const RecordingPresets = {
  HIGH_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  },
  LOW_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 64000,
    android: { outputFormat: '3gp', audioEncoder: 'amr_nb' },
  },
};

export async function setAudioModeAsync(_mode?: unknown): Promise<void> {}

export async function requestRecordingPermissionsAsync(): Promise<PermissionResponse> {
  return permission;
}

export async function getRecordingPermissionsAsync(): Promise<PermissionResponse> {
  return permission;
}

export class AudioRecorder {
  uri: string | null = null;
  isRecording = false;
  currentTime = 0;

  async prepareToRecordAsync(_options?: unknown): Promise<void> {
    recordingStatus = { ...recordingStatus, canRecord: true };
    statusListener?.(recordingStatus);
  }

  record(): void {
    this.isRecording = true;
    recordingStatus = {
      ...recordingStatus,
      isRecording: true,
      durationMillis: recordingStatus.durationMillis || 0,
    };
    statusListener?.(recordingStatus);
  }

  /** @deprecated Prefer {@link record} — kept for older mock tests. */
  async startAsync(): Promise<void> {
    this.record();
  }

  pause(): void {
    this.isRecording = false;
    recordingStatus = { ...recordingStatus, isRecording: false };
    statusListener?.(recordingStatus);
  }

  async stop(): Promise<void> {
    this.isRecording = false;
    this.currentTime = Math.max(this.currentTime, 1);
    recordingStatus = {
      ...recordingStatus,
      isRecording: false,
      durationMillis: Math.round(this.currentTime * 1000),
    };
    recordingUri = 'file:///mock-recording.m4a';
    this.uri = recordingUri;
    statusListener?.(recordingStatus);
  }

  /** @deprecated Prefer {@link stop} — kept for older mock tests. */
  async stopAsync(): Promise<{ uri: string }> {
    await this.stop();
    return { uri: this.uri! };
  }

  getStatus(): RecordingStatus {
    return recordingStatus;
  }

  setOnRecordingStatusUpdate(
    listener: (status: RecordingStatus) => void,
  ): void {
    statusListener = listener;
    listener(recordingStatus);
  }
}

export class AudioPlayer {
  uri: string | null = null;
  playing = false;
  paused = true;
  isLoaded = false;
  currentTime = 0;
  duration = 0;

  async loadAsync(
    source: { uri: string },
    _initialStatus?: unknown,
  ): Promise<void> {
    this.replace(source);
  }

  replace(source: string | { uri: string } | null): void {
    const uri =
      typeof source === 'string'
        ? source
        : source && typeof source === 'object'
        ? source.uri
        : null;
    this.uri = uri;
    this.isLoaded = Boolean(uri);
    this.duration = uri ? 1 : 0;
    this.currentTime = 0;
    this.playing = false;
    this.paused = true;
    playbackStatus = {
      isLoaded: this.isLoaded,
      isPlaying: false,
      durationMillis: this.duration * 1000,
      positionMillis: 0,
    };
    playbackListener?.(playbackStatus);
  }

  play(): void {
    this.playing = true;
    this.paused = false;
    playbackStatus = { ...playbackStatus, isPlaying: true };
    playbackListener?.(playbackStatus);
  }

  /** @deprecated Prefer {@link play} */
  async playAsync(): Promise<void> {
    this.play();
  }

  pause(): void {
    this.playing = false;
    this.paused = true;
    playbackStatus = { ...playbackStatus, isPlaying: false };
    playbackListener?.(playbackStatus);
  }

  /** @deprecated Prefer {@link pause} */
  async pauseAsync(): Promise<void> {
    this.pause();
  }

  async seekTo(seconds: number): Promise<void> {
    this.currentTime = seconds;
    playbackStatus = {
      ...playbackStatus,
      positionMillis: Math.round(seconds * 1000),
    };
    playbackListener?.(playbackStatus);
  }

  async stopAsync(): Promise<void> {
    this.pause();
    this.currentTime = 0;
    playbackStatus = {
      ...playbackStatus,
      isPlaying: false,
      positionMillis: 0,
    };
    playbackListener?.(playbackStatus);
  }

  remove(): void {
    this.uri = null;
    this.isLoaded = false;
  }

  getStatus(): PlaybackStatus {
    return playbackStatus;
  }

  setOnPlaybackStatusUpdate(listener: (status: PlaybackStatus) => void): void {
    playbackListener = listener;
    listener(playbackStatus);
  }
}

export function useAudioRecorder(_options?: unknown): AudioRecorder {
  return new AudioRecorder();
}

export function useAudioPlayer(_source?: unknown): AudioPlayer {
  return new AudioPlayer();
}

export function useAudioPlayerStatus(player: AudioPlayer): {
  playing: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
} {
  return {
    playing: player.playing,
    currentTime: player.currentTime,
    duration: player.duration,
    isLoaded: player.isLoaded,
  };
}

export function createAudioPlayer(_source?: unknown): AudioPlayer {
  return new AudioPlayer();
}

resetAudioMock();
