import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import {
  OPEN_CLASSIC_DRAFTING,
  PASSAGE_QUESTIONS_OPEN_DETAIL,
  PASSAGE_QUESTIONS_TITLE,
} from '../../../../constants/messages';

/**
 * The title's sheet: the whole title, which the header may cut short, over a
 * row up to the passage's book page, one to its Translation Questions, and one
 * into classic drafting, for what the player has no design for yet: verse
 * mode, everyone's takes, the other resources and Send.
 */
export function TitleSheet({
  visible,
  title,
  chapterName,
  milestoneName,
  onClose,
  onOpenBook,
  onOpenQuestions,
  onOpenClassic,
}: {
  visible: boolean;
  title: string;
  /** e.g. "Mark 14". */
  chapterName: string;
  milestoneName: string;
  onClose: () => void;
  onOpenBook: () => void;
  onOpenQuestions: () => void;
  onOpenClassic: () => void;
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
      <ListRow
        title={OPEN_CLASSIC_DRAFTING}
        subtitle="Takes by everyone, resources and Send"
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
