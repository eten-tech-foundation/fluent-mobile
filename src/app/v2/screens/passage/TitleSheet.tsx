import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import {
  OPEN_CLASSIC_DRAFTING,
  OPEN_CLASSIC_DRAFTING_DETAIL,
  TAKE_REVIEW_OPEN_DETAIL,
  TAKE_REVIEW_TITLE,
} from '../../../../constants/messages';

/**
 * The title's sheet: the whole title, which the header may cut short, over a
 * row up to the passage's book page, one to everyone's takes when others
 * have recorded here, and one into classic drafting, for what the player has
 * no design for yet: resources and Send.
 */
export function TitleSheet({
  visible,
  title,
  chapterName,
  milestoneName,
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
