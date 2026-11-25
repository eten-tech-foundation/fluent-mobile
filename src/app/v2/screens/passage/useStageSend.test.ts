import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  STAGE_SEND_CAPTURING,
  STAGE_SEND_COMPLETE_FAILED,
  STAGE_SEND_CONFIRM,
  STAGE_SEND_FAILED,
  STAGE_SEND_OK,
  STAGE_SEND_RETRY,
  STAGE_SEND_SENDING,
  stageSendBlocked,
  stageSendKept,
} from '../../../../constants/messages';
import { getStageAdvanceDestination } from '../../../../utils/stageAdvancement';
import type { Ready } from './ready';
import { useStageSend } from './useStageSend';

const mockRead = jest.fn();
const mockSend = jest.fn();

jest.mock('../../../../services/stageSend', () => {
  class StageSendBlockedError extends Error {}
  return {
    StageSendBlockedError,
    readStageSend: (...args: unknown[]) => mockRead(...args),
    sendChapterToStage: (...args: unknown[]) => mockSend(...args),
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

/** What the gate offers from `from`, labelled as the Record tab labels it. */
const sendable = (
  over: { disabled?: boolean; hasConflict?: boolean; from?: string } = {},
) => ({
  chapter: {},
  visibility: {
    visible: true,
    disabled: over.disabled ?? false,
    destination: getStageAdvanceDestination(over.from ?? 'draft'),
  },
  hasConflict: over.hasConflict ?? false,
  hasUnuploadableTakes: false,
});

type Props = { passage: Ready; userId: number | null; capturing: boolean };

function setup(
  initial: {
    passage?: Ready;
    userId?: number | null;
    capturing?: boolean;
  } = {},
) {
  const onSent = jest.fn();
  const hook = renderHook(
    (props: Props) => useStageSend({ ...props, onSent }),
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

describe('useStageSend', () => {
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
        label: 'Send to Peer Check',
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
        label: 'Send to Peer Check',
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
        label: 'Send to Peer Check',
        disabled: true,
        detail: STAGE_SEND_CAPTURING,
      }),
    );
  });

  it('confirms naming the chapter and Peer Check; Cancel sends nothing', async () => {
    mockRead.mockResolvedValue(sendable());
    const { result } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    expect(result.current.dialog?.title).toBe('Send to Peer Check?');
    expect(result.current.dialog?.message).toContain('Mark 14');
    expect(result.current.dialog?.message).toContain('Peer Check');
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_CONFIRM);
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
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_SENDING);
    act(() => result.current.dialog?.onCancel());
    expect(result.current.dialog).not.toBeNull();
    act(() => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      chapterAssignmentId: 7,
      userId: 4,
      draftingUnit: 'verse',
      to: 'peer_check',
    });
    await act(async () => resolve('queued'));
    expect(result.current.dialog).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("tells the drafter's queued send from one the server confirmed", async () => {
    mockRead.mockResolvedValue(null);
    const { result, rerender } = setup({
      passage: makePassage({ status: 'peer_check' }, true),
    });
    expect(result.current.row).toEqual({
      kind: 'queued',
      title: 'Waiting to send to Peer Check',
    });
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

  it('shows a queued later stage as waiting, and offers nothing more until it sends', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'linguist_check' }));
    const { result } = setup({
      passage: makePassage({ status: 'linguist_check' }, true),
      userId: 5,
    });
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.row).toEqual({
      kind: 'queued',
      title: 'Waiting to send to Linguist Check',
    });
    act(() => result.current.open());
    expect(result.current.dialog).toBeNull();
  });

  it.each([
    ['peer_check', 'Send to Community Review', 'community_review'],
    ['community_review', 'Send to Linguist Check', 'linguist_check'],
    ['linguist_check', 'Send to Theological Check', 'theological_check'],
    ['theological_check', 'Send to Consultant Check', 'consultant_check'],
    ['consultant_check', 'Send to Complete', 'complete'],
  ])(
    'at %s offers %s and sends to exactly that stage',
    async (from, label, to) => {
      mockRead.mockResolvedValue(sendable({ from }));
      mockSend.mockResolvedValue('confirmed');
      const { result, onSent } = setup({
        passage: makePassage({ status: from }),
        userId: 5,
      });
      await waitFor(() =>
        expect(result.current.row).toEqual({
          kind: 'send',
          label,
          disabled: false,
          detail: 'Mark 14',
        }),
      );
      act(() => result.current.open());
      expect(result.current.dialog?.title).toBe(`${label}?`);
      await act(async () => result.current.dialog?.onConfirm());
      expect(mockSend).toHaveBeenCalledWith({
        chapterAssignmentId: 7,
        userId: 5,
        draftingUnit: 'verse',
        to,
      });
      expect(result.current.dialog).toBeNull();
      expect(onSent).toHaveBeenCalledTimes(1);
    },
  );

  it('offers nothing on a Complete chapter', async () => {
    mockRead.mockResolvedValue(null);
    const { result } = setup({
      passage: makePassage({ status: 'complete' }),
      userId: 5,
    });
    await waitFor(() => expect(mockRead).toHaveBeenCalled());
    expect(result.current.row).toBeNull();
    act(() => result.current.open());
    expect(result.current.dialog).toBeNull();
  });

  it('acknowledges Complete only once the send resolves, and keeps a failed one retryable', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'consultant_check' }));
    let reject!: (e: Error) => void;
    mockSend.mockReturnValueOnce(new Promise((_r, j) => (reject = j)));
    const { result, onSent } = setup({
      passage: makePassage({ status: 'consultant_check' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    act(() => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_SENDING);
    expect(onSent).not.toHaveBeenCalled();

    await act(async () => reject(new Error('offline')));
    expect(result.current.dialog?.message).toBe(STAGE_SEND_COMPLETE_FAILED);
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_RETRY);
    expect(onSent).not.toHaveBeenCalled();

    mockSend.mockResolvedValueOnce('confirmed');
    await act(async () => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'complete' }),
    );
    expect(result.current.dialog).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('drops an unanswered question once the chapter moved to another stage', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    const { result, rerender } = setup({
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    expect(result.current.dialog?.title).toBe('Send to Linguist Check?');

    mockRead.mockResolvedValue(sendable({ from: 'linguist_check' }));
    rerender({
      passage: makePassage({ status: 'linguist_check' }),
      userId: 5,
      capturing: false,
    });
    await waitFor(() =>
      expect(result.current.row).toMatchObject({
        label: 'Send to Theological Check',
      }),
    );
    expect(result.current.dialog).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("doesn't bring back a question dropped while Send was unavailable", async () => {
    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    const { result, rerender } = setup({
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    expect(result.current.dialog).not.toBeNull();

    const props = {
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
      capturing: false,
    };
    mockRead.mockResolvedValue(
      sendable({ from: 'community_review', disabled: true, hasConflict: true }),
    );
    rerender(props);
    await waitFor(() =>
      expect(result.current.row).toMatchObject({ disabled: true }),
    );
    expect(result.current.dialog).toBeNull();

    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    rerender({
      ...props,
      passage: makePassage({ status: 'community_review' }),
    });
    await waitFor(() =>
      expect(result.current.row).toMatchObject({ disabled: false }),
    );
    expect(result.current.dialog).toBeNull();
  });

  it('closes a failed Complete once a reload shows the chapter Complete', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'consultant_check' }));
    mockSend.mockRejectedValueOnce(new Error('timeout'));
    const { result, rerender } = setup({
      passage: makePassage({ status: 'consultant_check' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(STAGE_SEND_COMPLETE_FAILED);

    mockRead.mockResolvedValue(null);
    rerender({
      passage: makePassage({ status: 'complete' }),
      userId: 5,
      capturing: false,
    });
    expect(result.current.dialog).toBeNull();
    await waitFor(() => expect(result.current.row).toBeNull());
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Dropped for good: a later reload back at Consultant Check doesn't revive it.
    mockRead.mockResolvedValue(sendable({ from: 'consultant_check' }));
    rerender({
      passage: makePassage({ status: 'consultant_check' }),
      userId: 5,
      capturing: false,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    expect(result.current.dialog).toBeNull();
  });

  it('retries the stage it asked about, not one the chapter moved to', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    mockSend.mockRejectedValueOnce(new Error('disk'));
    const { result, rerender } = setup({
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_RETRY);

    // A sync puts it back a stage; the failure stays up with Try again.
    mockRead.mockResolvedValue(sendable({ from: 'peer_check' }));
    rerender({
      passage: makePassage({ status: 'peer_check' }),
      userId: 5,
      capturing: false,
    });
    await waitFor(() =>
      expect(result.current.row).toMatchObject({
        label: 'Send to Community Review',
      }),
    );
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_RETRY);
    mockSend.mockRejectedValueOnce(new Error('blocked'));
    await act(async () => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'linguist_check' }),
    );
  });

  it('closes a failure once the chapter has reached the stage it asked about', async () => {
    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    mockSend.mockRejectedValueOnce(new Error('disk'));
    const { result, rerender } = setup({
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_RETRY);

    mockRead.mockResolvedValue(sendable({ from: 'linguist_check' }));
    rerender({
      passage: makePassage({ status: 'linguist_check' }),
      userId: 5,
      capturing: false,
    });
    expect(result.current.dialog).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog on a failure and sends again on Try again', async () => {
    mockRead.mockResolvedValue(sendable());
    mockSend.mockRejectedValueOnce(new Error('disk'));
    const { result, onSent } = setup();
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(STAGE_SEND_FAILED);
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_RETRY);
    expect(onSent).not.toHaveBeenCalled();

    mockSend.mockResolvedValueOnce('confirmed');
    await act(async () => result.current.dialog?.onConfirm());
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result.current.dialog).toBeNull();
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('says when the chapter could not be sent, or the server kept it', async () => {
    const { StageSendBlockedError } = jest.requireMock(
      '../../../../services/stageSend',
    );
    mockRead.mockResolvedValue(sendable({ from: 'community_review' }));
    mockSend.mockRejectedValueOnce(new StageSendBlockedError());
    const { result, onSent } = setup({
      passage: makePassage({ status: 'community_review' }),
      userId: 5,
    });
    await waitFor(() => expect(result.current.row?.kind).toBe('send'));
    act(() => result.current.open());
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(
      stageSendBlocked('Linguist Check'),
    );

    mockSend.mockResolvedValueOnce('kept');
    await act(async () => result.current.dialog?.onConfirm());
    expect(result.current.dialog?.message).toBe(stageSendKept('Mark 14'));
    expect(result.current.dialog?.confirmLabel).toBe(STAGE_SEND_OK);
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
