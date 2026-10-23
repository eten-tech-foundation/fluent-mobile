import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentAudioPlaybackState } from '../components/comments/types';
import { logger } from '../utils/logger';
import { usePlaybackEngine } from './usePlaybackEngine';

const log = logger.create('CommentPlaybackAdapter');

export type UseCommentPlaybackAdapterApi = CommentAudioPlaybackState & {
  onPlayPauseCommentAudio: (commentId: string, audioUri: string) => void;
  stopCommentAudio: () => void;
};

/**
 * Thin #451 adapter over the shared playback engine.
 * One playing comment id at a time; reuses `usePlaybackEngine` (no second engine).
 */
export function useCommentPlaybackAdapter(): UseCommentPlaybackAdapterApi {
  const playback = usePlaybackEngine();
  const [playingCommentId, setPlayingCommentId] = useState<string | null>(null);
  const prevStatusRef = useRef(playback.status);

  // Clear only on natural finish (playing → idle), not while play() is starting.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = playback.status;
    if (prev === 'playing' && playback.status === 'idle') {
      setPlayingCommentId(null);
    }
  }, [playback.status]);

  const stopCommentAudio = useCallback(() => {
    void playback.stop().catch(error => {
      log.error('Comment playback stop failed', { error });
    });
    setPlayingCommentId(null);
  }, [playback]);

  const onPlayPauseCommentAudio = useCallback(
    (commentId: string, audioUri: string) => {
      void (async () => {
        try {
          if (
            playingCommentId === commentId &&
            playback.status === 'playing'
          ) {
            await playback.pause();
            setPlayingCommentId(null);
            return;
          }
          setPlayingCommentId(commentId);
          await playback.play(audioUri);
        } catch (error) {
          log.error('Comment play/pause failed', { commentId, error });
          setPlayingCommentId(null);
        }
      })();
    },
    [playback, playingCommentId],
  );

  return {
    playingCommentId,
    onPlayPauseCommentAudio,
    stopCommentAudio,
  };
}
