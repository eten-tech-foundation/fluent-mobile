import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import {
  PASSAGE_QUESTIONS_OPEN_DETAIL,
  PASSAGE_QUESTIONS_TITLE,
  PEER_CHECK_SENT_DETAIL,
  PEER_CHECK_SENT_TITLE,
  STAGE_QUEUED_DETAIL,
  TAKE_REVIEW_OPEN_DETAIL,
  TAKE_REVIEW_TITLE,
} from '../../../../constants/messages';
import type { StageSendRow } from './useStageSend';

/**
 * The title's sheet: the book page, sending to the chapter's next stage,
 * everyone's takes, and Translation Questions.
 */
export function TitleSheet({
  visible,
  title,
  chapterName,
  milestoneName,
  send,
  onSend,
  onClose,
  onOpenBook,
  onOpenQuestions,
  onOpenReview,
}: {
  visible: boolean;
  title: string;
  /** e.g. "Mark 14". */
  chapterName: string;
  milestoneName: string;
  /** Omitted when this account has no send here. */
  send: StageSendRow | null;
  onSend: () => void;
  onClose: () => void;
  onOpenBook: () => void;
  onOpenQuestions: () => void;
  /** Absent when no other account has takes here. */
  onOpenReview?: () => void;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="passage-title-sheet"
    >
      <ListRow
        title={chapterName}
        subtitle={milestoneName}
        trailing="chevron"
        onPress={() => {
          onClose();
          onOpenBook();
        }}
        accessibilityLabel={`${chapterName} · ${milestoneName}. Open book page.`}
        testID="passage-book"
      />
      {send?.kind === 'send' ? (
        <ListRow
          title={send.label}
          subtitle={send.detail}
          trailing="chevron"
          disabled={send.disabled}
          onPress={() => {
            onClose();
            onSend();
          }}
          accessibilityLabel={`${send.label}. ${send.detail}`}
          testID="passage-send"
        />
      ) : send?.kind === 'queued' ? (
        <ListRow
          title={send.title}
          subtitle={STAGE_QUEUED_DETAIL}
          testID="passage-send-queued"
        />
      ) : send?.kind === 'sent' ? (
        <ListRow
          title={PEER_CHECK_SENT_TITLE}
          subtitle={PEER_CHECK_SENT_DETAIL}
          testID="passage-send-sent"
        />
      ) : null}
      {onOpenReview ? (
        <ListRow
          title={TAKE_REVIEW_TITLE}
          subtitle={TAKE_REVIEW_OPEN_DETAIL}
          trailing="chevron"
          onPress={() => {
            onClose();
            onOpenReview();
          }}
          testID="passage-open-review"
        />
      ) : null}
      <ListRow
        title={PASSAGE_QUESTIONS_TITLE}
        subtitle={PASSAGE_QUESTIONS_OPEN_DETAIL}
        trailing="chevron"
        onPress={() => {
          onClose();
          onOpenQuestions();
        }}
        testID="passage-open-questions"
      />
    </BottomSheet>
  );
}
