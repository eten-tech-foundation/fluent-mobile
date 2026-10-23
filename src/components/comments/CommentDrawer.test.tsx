import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CommentDrawer, CommentDrawerEntry } from './CommentDrawer';
import type { OrderedComment } from './commentPresentation';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = (props: { testID?: string }) => (
    <ReactNative.View testID={props.testID} />
  );
  return {
    MessageSquare: Mock,
    Mic: Mock,
    Send: Mock,
    Square: Mock,
    Play: Mock,
    Pause: Mock,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 12, left: 0 }),
}));

function fixture(
  partial: Partial<OrderedComment> &
    Pick<OrderedComment, 'id' | 'sortKey' | 'connectionState'>,
): OrderedComment {
  return {
    parentId: null,
    authorDisplayName: 'Ada',
    authorRoleLabel: 'Observer',
    createdAtLabel: '2m ago',
    text: null,
    bodyEmoji: null,
    audioUri: null,
    currentUserReactionEmoji: null,
    ...partial,
  };
}

const baseComments: OrderedComment[] = [
  fixture({
    id: 'root-b',
    sortKey: 20,
    connectionState: 'connected',
    text: 'Later root',
    authorDisplayName: 'Bea',
    authorRoleLabel: 'Translator',
    createdAtLabel: '1h ago',
  }),
  fixture({
    id: 'root-a',
    sortKey: 10,
    connectionState: 'connected',
    text: 'Earlier root',
    authorDisplayName: 'Ada',
    authorRoleLabel: 'Observer',
    createdAtLabel: '2h ago',
  }),
  fixture({
    id: 'reply-a',
    sortKey: 15,
    parentId: 'root-a',
    connectionState: 'connected',
    text: 'Reply under A',
    authorDisplayName: 'Cy',
    authorRoleLabel: 'Translator',
    createdAtLabel: '90m ago',
  }),
  fixture({
    id: 'orphan-1',
    sortKey: 5,
    connectionState: 'unconnected',
    text: 'Unconnected note',
    authorDisplayName: 'Dee',
    authorRoleLabel: 'Observer',
    createdAtLabel: '3h ago',
  }),
  fixture({
    id: 'audio-1',
    sortKey: 25,
    connectionState: 'connected',
    audioUri: 'file://comment.m4a',
    authorDisplayName: 'Eve',
    authorRoleLabel: 'Translator',
    createdAtLabel: '30m ago',
  }),
  fixture({
    id: 'emoji-1',
    sortKey: 12,
    connectionState: 'connected',
    bodyEmoji: '🙏',
    authorDisplayName: 'Fay',
    authorRoleLabel: 'Observer',
    createdAtLabel: '100m ago',
  }),
];

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof CommentDrawer>> = {},
) {
  const props: React.ComponentProps<typeof CommentDrawer> = {
    visible: true,
    onDismiss: jest.fn(),
    comments: baseComments,
    canCompose: true,
    canReact: true,
    isRecording: false,
    recordedAudioUri: null,
    playingCommentId: null,
    onRecordStart: jest.fn(),
    onRecordStop: jest.fn(),
    onSend: jest.fn(),
    onReply: jest.fn(),
    onReaction: jest.fn(),
    onPlayPauseCommentAudio: jest.fn(),
    ...overrides,
  };
  return { ...render(<CommentDrawer {...props} />), props };
}

describe('CommentDrawer (presentation fixtures)', () => {
  it('shows connected roots with role/timestamp (oldest-first covered in unit tests)', () => {
    const { getByTestId } = renderDrawer();
    expect(getByTestId('comment-drawer-threads-thread-root-a')).toBeTruthy();
    expect(getByTestId('comment-drawer-threads-thread-root-b')).toBeTruthy();
    expect(
      getByTestId('comment-drawer-threads-comment-root-a-role'),
    ).toHaveTextContent('Observer');
    expect(
      getByTestId('comment-drawer-threads-comment-root-a-timestamp'),
    ).toHaveTextContent('2h ago');
    expect(
      getByTestId('comment-drawer-threads-comment-reply-a-text'),
    ).toHaveTextContent('Reply under A');
  });

  it('shows all chapter Unconnected in a labeled section', () => {
    const { getByTestId, getByText } = renderDrawer();
    expect(getByTestId('comment-drawer-threads-unconnected')).toBeTruthy();
    expect(getByText('Unconnected')).toBeTruthy();
    expect(
      getByTestId('comment-drawer-threads-comment-orphan-1-text'),
    ).toHaveTextContent('Unconnected note');
  });

  it('flattens reply callback to root id when replying from a reply', () => {
    const { getByTestId, props } = renderDrawer();
    fireEvent.press(
      getByTestId('comment-drawer-threads-comment-reply-a-reply'),
    );
    expect(props.onReply).toHaveBeenCalledWith('root-a');
  });

  it('reaction replace then same-tap clear via callback (no persist)', () => {
    const comments: OrderedComment[] = [
      fixture({
        id: 'r',
        sortKey: 1,
        connectionState: 'connected',
        text: 'hi',
        currentUserReactionEmoji: '👍',
      }),
    ];
    const { getByTestId, props } = renderDrawer({ comments });
    fireEvent.press(getByTestId('comment-drawer-threads-comment-r-react-❤️'));
    expect(props.onReaction).toHaveBeenCalledWith({
      commentId: 'r',
      emoji: '❤️',
    });
    fireEvent.press(getByTestId('comment-drawer-threads-comment-r-react-👍'));
    expect(props.onReaction).toHaveBeenCalledWith({
      commentId: 'r',
      emoji: null,
    });
  });

  it('composer empty validation; text / emoji-only / audio send', async () => {
    const { getByTestId, props } = renderDrawer();
    fireEvent.press(getByTestId('comment-drawer-composer-send'));
    expect(props.onSend).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('comment-drawer-composer-text'), 'Hello');
    fireEvent.press(getByTestId('comment-drawer-composer-send'));
    await waitFor(() => {
      expect(props.onSend).toHaveBeenCalledWith({
        kind: 'text',
        text: 'Hello',
      });
    });

    fireEvent.press(getByTestId('comment-drawer-composer-body-emoji-👍'));
    fireEvent.press(getByTestId('comment-drawer-composer-send'));
    await waitFor(() => {
      expect(props.onSend).toHaveBeenCalledWith({
        kind: 'emoji_only',
        emoji: '👍',
      });
    });
  });

  it('sends audio payload when parent supplies recordedAudioUri', async () => {
    const { getByTestId, props } = renderDrawer({
      recordedAudioUri: 'file://clip.m4a',
    });
    expect(getByTestId('comment-drawer-composer-audio-ready')).toBeTruthy();
    fireEvent.press(getByTestId('comment-drawer-composer-send'));
    await waitFor(() => {
      expect(props.onSend).toHaveBeenCalledWith({
        kind: 'audio',
        audioUri: 'file://clip.m4a',
      });
    });
  });

  it('keeps composer text when onSend returns false', async () => {
    const onSend = jest.fn(async () => false);
    const { getByTestId } = renderDrawer({ onSend });
    fireEvent.changeText(getByTestId('comment-drawer-composer-text'), 'Keep');
    fireEvent.press(getByTestId('comment-drawer-composer-send'));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({ kind: 'text', text: 'Keep' });
    });
    expect(getByTestId('comment-drawer-composer-text').props.value).toBe(
      'Keep',
    );
  });

  it('forwards controlled record start/stop callbacks', () => {
    const { getByTestId, props, rerender } = renderDrawer();
    fireEvent.press(getByTestId('comment-drawer-composer-record-start'));
    expect(props.onRecordStart).toHaveBeenCalledTimes(1);

    rerender(
      <CommentDrawer
        {...props}
        isRecording
        onRecordStart={props.onRecordStart}
        onRecordStop={props.onRecordStop}
      />,
    );
    fireEvent.press(getByTestId('comment-drawer-composer-record-stop'));
    expect(props.onRecordStop).toHaveBeenCalledTimes(1);
  });

  it('read-only presentation when canCompose is false', () => {
    const { getByTestId, queryByTestId } = renderDrawer({ canCompose: false });
    expect(getByTestId('comment-drawer-composer-readonly')).toBeTruthy();
    expect(queryByTestId('comment-drawer-composer-text')).toBeNull();
  });

  it('dismisses via outside backdrop tap (existing Modal pattern)', () => {
    const { getByTestId, props } = renderDrawer();
    fireEvent.press(getByTestId('comment-drawer-backdrop'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('attaches drag handlers on the sheet handle for dismiss', () => {
    const { getByTestId } = renderDrawer();
    const handle = getByTestId('comment-drawer-handle');
    expect(
      handle.props.onMoveShouldSetResponder != null ||
        handle.props.onStartShouldSetResponder != null ||
        typeof handle.props.onResponderRelease === 'function',
    ).toBe(true);
  });

  it('forwards comment audio play callback without claiming engine play', () => {
    const { getByTestId, props } = renderDrawer({
      playingCommentId: null,
    });
    fireEvent.press(
      getByTestId('comment-drawer-threads-comment-audio-1-audio-play'),
    );
    expect(props.onPlayPauseCommentAudio).toHaveBeenCalledWith(
      'audio-1',
      'file://comment.m4a',
    );
  });

  it('renders emoji-only body content from fixtures', () => {
    const { getByTestId } = renderDrawer();
    expect(
      getByTestId('comment-drawer-threads-comment-emoji-1-body-emoji'),
    ).toHaveTextContent('🙏');
  });

  it('CommentDrawerEntry clears reply root on dismiss', () => {
    const onDismiss = jest.fn();
    const onReplyRootChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CommentDrawerEntry
        visible
        onDismiss={onDismiss}
        onReplyRootChange={onReplyRootChange}
        comments={baseComments}
        canCompose
        canReact
        isRecording={false}
        recordedAudioUri={null}
        playingCommentId={null}
        onRecordStart={jest.fn()}
        onRecordStop={jest.fn()}
        onSend={jest.fn()}
        onReaction={jest.fn()}
        onPlayPauseCommentAudio={jest.fn()}
      />,
    );

    fireEvent.press(
      getByTestId('comment-drawer-threads-comment-reply-a-reply'),
    );
    expect(onReplyRootChange).toHaveBeenCalledWith('root-a');
    expect(getByTestId('comment-drawer-reply-hint')).toBeTruthy();

    fireEvent.press(getByTestId('comment-drawer-backdrop'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onReplyRootChange).toHaveBeenLastCalledWith(null);
    expect(queryByTestId('comment-drawer-reply-hint')).toBeNull();
  });
});
