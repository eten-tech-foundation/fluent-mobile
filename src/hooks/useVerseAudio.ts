import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import {
  useAudioPermission,
  PermissionStatus,
  PlayerState,
  RecorderState,
  FinishMode,
  type IWaveformRef,
} from '@simform_solutions/react-native-audio-waveform';
import RNFS from 'react-native-fs';
import { ChapterAssignmentData } from '../types/db/types';
import { getBibleTextId } from '../db/queries';
import { upsertRecording, deleteRecording } from '../db/repository';
import { getVerseAudioPath, deleteVerseAudio } from '../utils/audioStorage';
import { logger } from '../utils/logger';

const log = logger.create('useVerseAudio');

export type VerseAudioState = 'idle' | 'recording' | 'recorded';

export type VerseAudioEntry = {
  state: VerseAudioState;
  path: string | null;
};

type Params = {
  selectedVerse: number;
  chapterData: ChapterAssignmentData | null;
  projectName: string;
  initialAudioMap: Record<number, VerseAudioEntry>;
};

export type UseVerseAudioResult = {
  liveRef: React.RefObject<IWaveformRef | null>;
  staticRef: React.RefObject<IWaveformRef | null>;

  verseAudio: Record<number, VerseAudioEntry>;
  verseState: VerseAudioState;
  recordedPath: string | null;
  isPlaying: boolean;
  isPausedRecording: boolean;

  setPlayerState: (s: PlayerState) => void;
  setRecorderState: (s: RecorderState) => void;

  startRecord: () => Promise<void>;
  pauseRecord: () => Promise<void>;
  resumeRecord: () => Promise<void>;
  stopRecord: () => Promise<void>;
  playPause: () => Promise<void>;
  stopPlayer: () => Promise<void>;
  deleteAudio: () => Promise<void>;
};

export function useVerseAudio({
  selectedVerse,
  chapterData,
  projectName,
  initialAudioMap,
}: Params): UseVerseAudioResult {
  const [verseAudio, setVerseAudio] = useState<Record<number, VerseAudioEntry>>(
    {},
  );
  const [playerState, setPlayerState] = useState<PlayerState>(
    PlayerState.stopped,
  );
  const [recorderState, setRecorderState] = useState<RecorderState>(
    RecorderState.stopped,
  );

  const liveRef = useRef<IWaveformRef>(null);
  const staticRef = useRef<IWaveformRef>(null);

  const recordingStarted = useRef(false);
  const tempRecordingPath = useRef<string | null>(null);
  const finalRecordingPath = useRef<string | null>(null);

  const { checkHasAudioRecorderPermission, getAudioRecorderPermission } =
    useAudioPermission();

  useEffect(() => {
    if (Object.keys(initialAudioMap).length > 0) {
      setVerseAudio(initialAudioMap);
    }
  }, [initialAudioMap]);

  useEffect(() => {
    const player = staticRef.current;
    const recorder = liveRef.current;
    player?.stopPlayer().catch(() => {});
    if (recordingStarted.current) {
      recorder?.stopRecord().catch(() => {});
      recordingStarted.current = false;
    }
    setPlayerState(PlayerState.stopped);
    setRecorderState(RecorderState.stopped);
  }, [selectedVerse]);

  useEffect(() => {
    const player = staticRef.current;
    const recorder = liveRef.current;
    return () => {
      player?.stopPlayer().catch(() => {});
      recorder?.stopRecord().catch(() => {});
    };
  }, []);

  const ensurePermission = useCallback(async (): Promise<boolean> => {
    let status = await checkHasAudioRecorderPermission();
    if (status === PermissionStatus.granted) return true;
    if (status === PermissionStatus.undetermined) {
      status = await getAudioRecorderPermission();
      return status === PermissionStatus.granted;
    }
    Alert.alert(
      'Microphone Permission',
      'Microphone access is required to record audio. Please enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }, [checkHasAudioRecorderPermission, getAudioRecorderPermission]);

  async function startRecord() {
    const allowed = await ensurePermission();
    if (!allowed || !chapterData) return;

    await staticRef.current?.stopPlayer().catch(() => {});
    setPlayerState(PlayerState.stopped);

    try {
      const finalPath = await getVerseAudioPath(
        projectName,
        chapterData.bookCode ?? String(chapterData.bookId),
        chapterData.chapterNumber,
        selectedVerse,
      );
      const tempPath = `${
        RNFS.CachesDirectoryPath
      }/recording_${Date.now()}.m4a`;

      tempRecordingPath.current = tempPath;
      finalRecordingPath.current = finalPath;

      log.debug('Starting recording', { tempPath, finalPath });

      await liveRef.current?.startRecord({
        encoder: 1,
        sampleRate: 44100,
        bitRate: 128000,
        fileNameFormat: tempPath,
        useLegacy: false,
      });

      recordingStarted.current = true;
      setVerseAudio(prev => ({
        ...prev,
        [selectedVerse]: { state: 'recording', path: null },
      }));
    } catch (err) {
      log.error('startRecord error:', { err });
    }
  }

  async function pauseRecord() {
    try {
      await liveRef.current?.pauseRecord();
    } catch (err) {
      log.error('pauseRecord error:', { err });
    }
  }

  async function resumeRecord() {
    try {
      await liveRef.current?.resumeRecord();
    } catch (err) {
      log.error('resumeRecord error:', { err });
    }
  }

  async function stopRecord() {
    try {
      const recordedTempPath = await liveRef.current?.stopRecord();
      recordingStarted.current = false;
      setRecorderState(RecorderState.stopped);

      const tempPath = recordedTempPath ?? tempRecordingPath.current;
      const finalPath = finalRecordingPath.current;

      if (!tempPath || !finalPath)
        throw new Error('Missing temp or final path');

      log.debug('Stopping recording', { tempPath, finalPath });

      if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath);

      const finalDir = finalPath.substring(0, finalPath.lastIndexOf('/'));
      if (!(await RNFS.exists(finalDir))) await RNFS.mkdir(finalDir);

      await RNFS.moveFile(tempPath, finalPath);
      log.debug('Recording moved', { finalPath });

      if (chapterData) {
        try {
          const [stat, bibleTextId] = await Promise.all([
            RNFS.stat(finalPath),
            getBibleTextId(
              chapterData.bibleId,
              chapterData.bookId,
              chapterData.chapterNumber,
              selectedVerse,
            ),
          ]);
          if (bibleTextId !== null) {
            await upsertRecording({
              bibleTextId,
              projectUnitId: chapterData.projectUnitId,
              localPath: finalPath,
              fileSize: Number(stat.size),
            });
          }
        } catch (dbErr) {
          log.error('Failed to persist recording metadata', { dbErr });
        }
      }

      setVerseAudio(prev => ({
        ...prev,
        [selectedVerse]: { state: 'recorded', path: finalPath },
      }));

      tempRecordingPath.current = null;
      finalRecordingPath.current = null;
    } catch (err) {
      log.error('stopRecord error:', { err });
      Alert.alert('Recording Error', 'Failed to save recording.');
    }
  }

  async function playPause() {
    if (!staticRef.current) return;
    try {
      if (playerState === PlayerState.playing) {
        await staticRef.current.pausePlayer();
      } else if (playerState === PlayerState.paused) {
        await staticRef.current.resumePlayer();
      } else {
        await staticRef.current.startPlayer({ finishMode: FinishMode.stop });
      }
    } catch (err) {
      log.error('playPause error:', { err });
    }
  }

  async function stopPlayer() {
    try {
      await staticRef.current?.stopPlayer();
    } catch (err) {
      log.error('stopPlayer error:', { err });
    }
  }

  async function deleteAudio() {
    const path = verseAudio[selectedVerse]?.path ?? null;
    await staticRef.current?.stopPlayer().catch(() => {});

    if (path) await deleteVerseAudio(path);

    if (chapterData) {
      const bibleTextId = await getBibleTextId(
        chapterData.bibleId,
        chapterData.bookId,
        chapterData.chapterNumber,
        selectedVerse,
      );
      if (bibleTextId !== null) {
        await deleteRecording(chapterData.projectUnitId, bibleTextId);
      }
    }

    setVerseAudio(prev => ({
      ...prev,
      [selectedVerse]: { state: 'idle', path: null },
    }));
    setPlayerState(PlayerState.stopped);
  }

  const currentAudio = verseAudio[selectedVerse];
  const verseState: VerseAudioState = currentAudio?.state ?? 'idle';
  const recordedPath: string | null = currentAudio?.path ?? null;
  const isPlaying = playerState === PlayerState.playing;
  const isPausedRecording = recorderState === RecorderState.paused;

  return {
    liveRef,
    staticRef,
    verseAudio,
    verseState,
    recordedPath,
    isPlaying,
    isPausedRecording,
    setPlayerState,
    setRecorderState,
    startRecord,
    pauseRecord,
    resumeRecord,
    stopRecord,
    playPause,
    stopPlayer,
    deleteAudio,
  };
}
