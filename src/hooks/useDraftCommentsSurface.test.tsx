import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FluentAPI } from '../services/api';
import { getCredentials } from '../services/keychain';
import {
  readBoundCommentAggregate,
  refreshBoundCommentAggregates,
} from '../services/commentAggregateBinding';
import { useDraftCommentsSurface } from './useDraftCommentsSurface';
import { useCommentPlaybackAdapter } from './useCommentPlaybackAdapter';
import { useCommentRecordingAdapter } from './useCommentRecordingAdapter';

jest.mock('../services/api', () => ({
  FluentAPI: {
    listChapterComments: jest.fn(),
    createChapterComment: jest.fn(),
    createChapterCommentReply: jest.fn(),
    createCommentAudio: jest.fn(),
    setChapterCommentReaction: jest.fn(),
    clearChapterCommentReaction: jest.fn(),
  },
}));

jest.mock('../services/keychain', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../services/commentAggregateBinding', () => ({
  readBoundCommentAggregate: jest.fn(() => ({ status: 'unknown' })),
  refreshBoundCommentAggregates: jest.fn(async () => undefined),
}));

jest.mock('./useCommentRecordingAdapter', () => ({
  useCommentRecordingAdapter: jest.fn(),
}));

jest.mock('./useCommentPlaybackAdapter', () => ({
  useCommentPlaybackAdapter: jest.fn(),
}));

const mockList = FluentAPI.listChapterComments as jest.MockedFunction<
  typeof FluentAPI.listChapterComments
>;
const mockCreate = FluentAPI.createChapterComment as jest.MockedFunction<
  typeof FluentAPI.createChapterComment
>;
const mockCreateReply =
  FluentAPI.createChapterCommentReply as jest.MockedFunction<
    typeof FluentAPI.createChapterCommentReply
  >;
const mockCreateAudio = FluentAPI.createCommentAudio as jest.MockedFunction<
  typeof FluentAPI.createCommentAudio
>;
const mockSetReaction =
  FluentAPI.setChapterCommentReaction as jest.MockedFunction<
    typeof FluentAPI.setChapterCommentReaction
  >;
const mockGetCredentials = getCredentials as jest.MockedFunction<
  typeof getCredentials
>;
const mockRefreshAggregates =
  refreshBoundCommentAggregates as jest.MockedFunction<
    typeof refreshBoundCommentAggregates
  >;
const mockReadAggregate = readBoundCommentAggregate as jest.MockedFunction<
  typeof readBoundCommentAggregate
>;
const mockUseRecording = useCommentRecordingAdapter as jest.MockedFunction<
  typeof useCommentRecordingAdapter
>;
const mockUsePlayback = useCommentPlaybackAdapter as jest.MockedFunction<
  typeof useCommentPlaybackAdapter
>;

const clearRecordedAudio = jest.fn();
const stopCommentAudio = jest.fn();

describe('useDraftCommentsSurface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({ connected: [], unconnected: [] });
    mockGetCredentials.mockResolvedValue({ token: 'tok' });
    mockReadAggregate.mockReturnValue({ status: 'unknown' });
    mockUseRecording.mockReturnValue({
      isRecording: false,
      recordedAudioUri: null,
      onRecordStart: jest.fn(),
      onRecordStop: jest.fn(),
      clearRecordedAudio,
      micPermission: null,
    });
    mockUsePlayback.mockReturnValue({
      playingCommentId: null,
      onPlayPauseCommentAudio: jest.fn(),
      stopCommentAudio,
    });
  });

  it('loads list when enabled and keeps mutations gated when canCompose false', async () => {
    const { result } = renderHook(() =>
      useDraftCommentsSurface({
        chapterAssignmentId: 9,
        userId: '7',
        enabled: true,
        canCompose: false,
        canReact: false,
      }),
    );

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(9);
    });

    let sendOk = true;
    await act(async () => {
      sendOk = await result.current.onSend({ kind: 'text', text: 'hi' });
    });
    expect(sendOk).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();

    await act(async () => {
      result.current.onReaction({ commentId: '11', emoji: '👍' });
    });
    expect(mockSetReaction).not.toHaveBeenCalled();
  });

  it('creates pericope-anchored text and audio payloads', async () => {
    mockCreate.mockResolvedValueOnce({ id: 10 } as never);
    mockCreateAudio.mockResolvedValueOnce({ id: 11 } as never);

    const { result } = renderHook(() =>
      useDraftCommentsSurface({
        chapterAssignmentId: 9,
        userId: '7',
        enabled: true,
        canCompose: true,
        canReact: false,
        activeCommentAnchor: {
          kind: 'pericope',
          pericopeNumber: '1.2',
          pericopeSetId: 3,
        },
      }),
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await act(async () => {
      result.current.openForPericope('1.2', 3);
    });
    await act(async () => {
      await result.current.onSend({ kind: 'text', text: 'pericope note' });
    });
    expect(mockCreate).toHaveBeenCalledWith(9, {
      anchor: { kind: 'pericope', pericopeNumber: '1.2', pericopeSetId: 3 },
      body: { kind: 'text', text: 'pericope note' },
    });

    await act(async () => {
      result.current.openForPericope('1.2', 3);
    });
    await act(async () => {
      await result.current.onSend({
        kind: 'audio',
        audioUri: 'file://p.aac',
      });
    });
    expect(mockCreateAudio).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        anchorKind: 'pericope',
        pericopeNumber: '1.2',
        pericopeSetId: 3,
        file: expect.objectContaining({ uri: 'file://p.aac' }),
      }),
    );
  });

  it('maps emoji_only to wire emoji body and clears draft only on success', async () => {
    mockCreate.mockResolvedValueOnce({ id: 1 } as never);
    const { result } = renderHook(() =>
      useDraftCommentsSurface({
        chapterAssignmentId: 9,
        userId: '7',
        enabled: true,
        canCompose: true,
        canReact: false,
        activeVerseBibleTextId: 401,
      }),
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await act(async () => {
      result.current.onComposerTextChange('scratch');
      result.current.onComposerBodyEmojiChange('🙏');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.onSend({ kind: 'emoji_only', emoji: '🙏' });
    });
    expect(ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(9, {
      anchor: { kind: 'verse', bibleTextId: 401 },
      body: { kind: 'emoji', emoji: '🙏' },
    });
    expect(result.current.composerText).toBe('');
    expect(result.current.composerBodyEmoji).toBeNull();
    expect(clearRecordedAudio).toHaveBeenCalled();
    expect(mockRefreshAggregates).toHaveBeenCalled();
  });

  it('preserves composer draft on send failure and on dismiss', async () => {
    mockCreate.mockRejectedValueOnce(new Error('offline'));
    mockUseRecording.mockReturnValue({
      isRecording: false,
      recordedAudioUri: 'file://clip.aac',
      onRecordStart: jest.fn(),
      onRecordStop: jest.fn(),
      clearRecordedAudio,
      micPermission: null,
    });

    const { result } = renderHook(() =>
      useDraftCommentsSurface({
        chapterAssignmentId: 9,
        userId: '7',
        enabled: true,
        canCompose: true,
        canReact: false,
        activeVerseBibleTextId: 401,
      }),
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await act(async () => {
      result.current.onComposerTextChange('keep me');
      result.current.openForVerse(401);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.onSend({ kind: 'text', text: 'keep me' });
    });
    expect(ok).toBe(false);
    expect(result.current.composerText).toBe('keep me');
    expect(clearRecordedAudio).not.toHaveBeenCalled();

    await act(async () => {
      result.current.dismiss();
    });
    expect(result.current.drawerVisible).toBe(false);
    expect(result.current.composerText).toBe('keep me');
    expect(result.current.recordedAudioUri).toBe('file://clip.aac');
    expect(clearRecordedAudio).not.toHaveBeenCalled();
    expect(stopCommentAudio).toHaveBeenCalled();
  });

  it('sends reply JSON and audio behind canCompose', async () => {
    mockCreateReply.mockResolvedValueOnce({ id: 2 } as never);
    mockCreateAudio.mockResolvedValueOnce({ id: 3 } as never);

    const { result } = renderHook(() =>
      useDraftCommentsSurface({
        chapterAssignmentId: 9,
        userId: '7',
        enabled: true,
        canCompose: true,
        canReact: true,
        activeVerseBibleTextId: 401,
      }),
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await act(async () => {
      result.current.onReplyRootChange('11');
    });
    await act(async () => {
      await result.current.onSend({ kind: 'text', text: 'reply' });
    });
    expect(mockCreateReply).toHaveBeenCalledWith(9, {
      replyToCommentId: 11,
      body: { kind: 'text', text: 'reply' },
    });

    await act(async () => {
      result.current.onReplyRootChange('11');
    });
    await act(async () => {
      await result.current.onSend({
        kind: 'audio',
        audioUri: 'file://c.aac',
      });
    });
    expect(mockCreateAudio).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        replyToCommentId: 11,
        file: expect.objectContaining({ uri: 'file://c.aac' }),
      }),
    );
  });
});
