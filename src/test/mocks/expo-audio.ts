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

export class AudioRecorder {
  uri: string | null = null;

  async prepareToRecordAsync(_options?: unknown): Promise<void> {
    recordingStatus = { ...recordingStatus, canRecord: true };
    statusListener?.(recordingStatus);
  }

  async startAsync(): Promise<void> {
    recordingStatus = {
      ...recordingStatus,
      isRecording: true,
      durationMillis: 0,
    };
    statusListener?.(recordingStatus);
  }

  async stopAsync(): Promise<{ uri: string }> {
    recordingStatus = {
      ...recordingStatus,
      isRecording: false,
      durationMillis: recordingStatus.durationMillis || 1000,
    };
    recordingUri = 'file:///mock-recording.m4a';
    this.uri = recordingUri;
    statusListener?.(recordingStatus);
    return { uri: recordingUri };
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

  async loadAsync(
    source: { uri: string },
    _initialStatus?: unknown,
  ): Promise<void> {
    this.uri = source.uri;
    playbackStatus = {
      isLoaded: true,
      isPlaying: false,
      durationMillis: 1000,
      positionMillis: 0,
    };
    playbackListener?.(playbackStatus);
  }

  async playAsync(): Promise<void> {
    playbackStatus = { ...playbackStatus, isPlaying: true };
    playbackListener?.(playbackStatus);
  }

  async pauseAsync(): Promise<void> {
    playbackStatus = { ...playbackStatus, isPlaying: false };
    playbackListener?.(playbackStatus);
  }

  async stopAsync(): Promise<void> {
    playbackStatus = {
      ...playbackStatus,
      isPlaying: false,
      positionMillis: 0,
    };
    playbackListener?.(playbackStatus);
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

// The newer expo-audio hooks API surface used by useAudioPlayback /
// useSegmentedAudioPlayback. Kept minimal: tests that exercise those hooks in
// detail mock `expo-audio` inline; this only needs to exist so components that
// merely mount the hooks (e.g. RecordTab) don't crash on an undefined import.
export function useAudioPlayerStatus(_player?: unknown): {
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
} {
  return {
    playing: playbackStatus.isPlaying,
    currentTime: playbackStatus.positionMillis / 1000,
    duration: playbackStatus.durationMillis / 1000,
    didJustFinish: false,
  };
}

export async function setAudioModeAsync(_mode?: unknown): Promise<void> {}

resetAudioMock();
