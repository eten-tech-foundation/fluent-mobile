import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import {
  OPEN_CLASSIC_DRAFTING,
  OPEN_CLASSIC_DRAFTING_DETAIL,
  PEER_CHECK_QUEUED_DETAIL,
  PEER_CHECK_QUEUED_TITLE,
  PEER_CHECK_SEND_LABEL,
  PEER_CHECK_SENT_DETAIL,
  PEER_CHECK_SENT_TITLE,
  TAKE_REVIEW_OPEN_DETAIL,
  TAKE_REVIEW_TITLE,
} from '../../../../constants/messages';
import type { PeerCheckRow } from './usePeerCheckSend';

/**
 * The title's sheet: the book page, Send to Peer Check, everyone's takes when
 * others have recorded here, and classic drafting for remaining resources.
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
  onOpenClassic,
  onOpenReview,
}: {
  visible: boolean;
  title: string;
  /** e.g. "Mark 14". */
  chapterName: string;
  milestoneName: string;
  /** Omitted when this account has no send here. */
  send: PeerCheckRow | null;
  onSend: () => void;
  onClose: () => void;
  onOpenBook: () => void;
  onOpenClassic: () => void;
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
          title={PEER_CHECK_SEND_LABEL}
          subtitle={send.detail}
          trailing="chevron"
          disabled={send.disabled}
          onPress={() => {
            onClose();
            onSend();
          }}
          accessibilityLabel={`${PEER_CHECK_SEND_LABEL}. ${send.detail}`}
          testID="passage-send"
        />
      ) : send?.kind === 'queued' ? (
        <ListRow
          title={PEER_CHECK_QUEUED_TITLE}
          subtitle={PEER_CHECK_QUEUED_DETAIL}
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
        title={OPEN_CLASSIC_DRAFTING}
        subtitle={OPEN_CLASSIC_DRAFTING_DETAIL}
        trailing="chevron"
        onPress={() => {
          onClose();
          onOpenClassic();
        }}
        testID="passage-classic"
      />
    </BottomSheet>
  );
}
