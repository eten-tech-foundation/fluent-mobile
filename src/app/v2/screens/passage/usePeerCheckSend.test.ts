import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  PEER_CHECK_SEND_BLOCKED,
  PEER_CHECK_SEND_CONFIRM,
  PEER_CHECK_SEND_FAILED,
  PEER_CHECK_SEND_OK,
  PEER_CHECK_SEND_RETRY,
  PEER_CHECK_SEND_SENDING,
  PEER_CHECK_SEND_CAPTURING,
  RECORD_AUDIO_CONFLICT_WARNING,
  peerCheckSendKept,
} from '../../../../constants/messages';
import type { Ready } from './ready';
import { usePeerCheckSend } from './usePeerCheckSend';

const mockRead = jest.fn();
const mockSend = jest.fn();

jest.mock('../../../../services/peerCheckSend', () => {
  class PeerCheckSendBlockedError extends Error {}
  return {
    PeerCheckSendBlockedError,
    readPeerCheckSend: (...args: unknown[]) => mockRead(...args),
    sendChapterToPeerCheck: (...args: unknown[]) => mockSend(...args),
  };
});

jest.mock('../../../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({ draftingUnit: 'verse' }),
}));

const makePassage = (
  over: Partial<Ready['assignment']> = {},
  waiting = false,
) =>
  ({
    assignment: {
      id: 7,
      bookName: 'Mark',
      chapterNumber: 14,
      status: 'draft',
      assignedUserId: 4,
      ...over,
    },
    waitingToSend: waiting,
  } as unknown as Ready);

const sendable = (
  over: { disabled?: boolean; hasConflict?: boolean } = {},
) => ({
  chapter: {},
  visibility: {
    visible: true,
    disabled: over.disabled ?? false,
    destination: { nextStatus: 'peer_check' },
  },
  hasConflict: over.hasConflict ?? false,
  hasUnuploadableTakes: false,
});

function setup(
  initial: {
    passage?: Ready;
    userId?: number | null;
    capturing?: boolean;
  } = {},
) {
  const onSent = jest.fn();
  const hook = renderHook(
    (props: { passage: Ready; userId: number | null; capturing: boolean }) =>
      usePeerCheckSend({ ...props, onSent }),
    {
      initialProps: {
        passage: initial.passage ?? makePassage(),
        userId: initial.userId === undefined ? 4 : initial.userId,
        capturing: initial.capturing ?? false,
      },
    },
  );
  return { ...hook, onSent };
}

describe('usePeerCheckSend', () => {
  beforeEach(() => {
    mockRead.mockReset();
    mockSend.mockReset();
  });

  it('offers Send for the passage chapter only, naming it', async () => {
    mockRead.mockResolvedValue(sendable());
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.row).toEqual({
        kind: 'send',
        disabled: false,
        detail: 'Mark 14',
      }),
    );
    expect(mockRead).toHaveBeenCalledWith({
      chapterAssignmentId: 7,
      userId: 4,
      draftingUnit: 'verse',
    });
  });

  it('hides Send when the gate does not offer it', async () => {
    mockRead.mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    expect(result.current.row).toBeNull();
    act(() => result.current.open());
    expect(result.current.dialog).toBeNull();
  });

  it('shows a conflict as a disabled Send that will not open', async () => {
    mockRead.mockResolvedValue(sendable({ disabled: true, hasConflict: true }));
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.row).toEqual({
        kind: 'send',
        disabled: true,
        detail: RECORD_AUDIO_CONFLICT_WARNING,
      }),
    );
    act(() => result.current.open());
    expect(result.current.dialog).toBeNull();
  });

  it('waits for a take in progress', async () => {
    mockRead.mockResolvedValue(sendable());
    const { result } = setup({ capturing: true });
    await waitFor(() =>
      expect(result.current.row).toEqual({
        kind: 'send',
        disabled: true,
        detail: PEER_CHECK_SEND_CAPTURING,
      }),
    );
  });

  it('confirms naming the chapter and Peer Check; Cancel sends nothing', async () => {
    mockRead.mockResolvedValue(sendable());
    const { result } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    expect(result.current.dialog?.message).toContain('Mark 14');
    expect(result.current.dialog?.message).toContain('Peer Check');
    expect(result.current.dialog?.confirmLabel).toBe(PEER_CHECK_SEND_CONFIRM);
    act(() => result.current.dialog?.onCancel());
    expect(result.current.dialog).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends once however often Confirm is pressed', async () => {
    mockRead.mockResolvedValue(sendable());
    let resolve!: (v: string) => void;
    mockSend.mockReturnValue(new Promise(r => (resolve = r)));
    const { result, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    act(() => {
      result.current.dialog?.onConfirm();
      result.current.dialog?.onConfirm();
    });
    expect(result.current.dialog?.confirmLabel).toBe(PEER_CHECK_SEND_SENDING);
    act(() => result.current.dialog?.onCancel());
    expect(result.current.dialog).not.toBeNull();
    act(() => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      chapterAssignmentId: 7,
      userId: 4,
      draftingUnit: 'verse',
    });
    await act(async () => resolve('queued'));
    expect(result.current.dialog).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('tells a queued send from one the server confirmed', async () => {
    mockRead.mockResolvedValue(null);
    const { result, rerender } = setup({
      passage: makePassage({ status: 'peer_check' }, true),
    });
    expect(result.current.row).toEqual({ kind: 'queued' });
    rerender({
      passage: makePassage({ status: 'peer_check' }, false),
      userId: 4,
      capturing: false,
    });
    expect(result.current.row).toEqual({ kind: 'sent' });
    rerender({
      passage: makePassage({ status: 'peer_check' }, false),
      userId: 5,
      capturing: false,
    });
    expect(result.current.row).toBeNull();
  });

  it("doesn't call a later stage's queued advance a Peer Check send", () => {
    mockRead.mockResolvedValue(null);
    const { result } = setup({
      passage: makePassage({ status: 'community_review' }, true),
    });
    expect(result.current.row).toBeNull();
  });

  it('keeps the dialog on a failure and sends again on Try again', async () => {
    mockRead.mockResolvedValue(sendable());
    mockSend.mockRejectedValueOnce(new Error('disk'));
    const { result, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(PEER_CHECK_SEND_FAILED);
    expect(result.current.dialog?.confirmLabel).toBe(PEER_CHECK_SEND_RETRY);
    expect(onSent).not.toHaveBeenCalled();

    mockSend.mockResolvedValueOnce('confirmed');
    await act(async () => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.current.dialog).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('says when the chapter could not be sent, or the server kept it', async () => {
    const { PeerCheckSendBlockedError } = jest.requireMock(
      '../../../../services/peerCheckSend',
    );
    mockRead.mockResolvedValue(sendable());
    mockSend.mockRejectedValueOnce(new PeerCheckSendBlockedError());
    const { result, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(PEER_CHECK_SEND_BLOCKED);

    mockSend.mockResolvedValueOnce('kept');
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(peerCheckSendKept('Mark 14'));
    expect(result.current.dialog?.confirmLabel).toBe(PEER_CHECK_SEND_OK);
    expect(onSent).toHaveBeenCalledTimes(1);

    act(() => result.current.dialog?.onConfirm());
    expect(result.current.dialog).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("drops a send's result once the account changed", async () => {
    mockRead.mockResolvedValue(sendable());
    let reject!: (e: Error) => void;
    mockSend.mockReturnValue(new Promise((_r, j) => (reject = j)));
    const { result, rerender, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    act(() => result.current.dialog?.onConfirm());
    rerender({ passage: makePassage(), userId: 5, capturing: false });
    expect(result.current.dialog).toBeNull();
    await act(async () => reject(new Error('late')));
    expect(result.current.dialog).toBeNull();
    expect(onSent).not.toHaveBeenCalled();

    rerender({ passage: makePassage(), userId: 4, capturing: false });
    expect(result.current.dialog).toBeNull();
  });

  it("drops a confirmed send's result once the account changed", async () => {
    mockRead.mockResolvedValue(sendable());
    let resolve!: (v: string) => void;
    mockSend.mockReturnValue(new Promise(r => (resolve = r)));
    const { result, rerender, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    act(() => result.current.dialog?.onConfirm());
    rerender({ passage: makePassage(), userId: 5, capturing: false });
    await act(async () => resolve('confirmed'));
    expect(onSent).not.toHaveBeenCalled();

    rerender({ passage: makePassage(), userId: 4, capturing: false });
    expect(result.current.dialog).toBeNull();
  });

  it('drops a send that lands after leaving the passage', async () => {
    mockRead.mockResolvedValue(sendable());
    let resolve!: (v: string) => void;
    mockSend.mockReturnValue(new Promise(r => (resolve = r)));
    const { result, unmount, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    act(() => result.current.dialog?.onConfirm());
    unmount();
    await act(async () => resolve('confirmed'));
    expect(onSent).not.toHaveBeenCalled();
  });
});
