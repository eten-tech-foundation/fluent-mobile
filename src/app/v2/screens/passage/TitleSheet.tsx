import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import { OPEN_CLASSIC_DRAFTING } from '../../../../constants/messages';

/**
 * The title's sheet: the whole title, which the header may cut short, over a
 * row up to the passage's book page and one into classic drafting, for what
 * the player has no design for yet: verse mode, everyone's takes, resources
 * and Send.
 */
export function TitleSheet({
  visible,
  title,
  chapterName,
  milestoneName,
  onClose,
  onOpenBook,
  onOpenClassic,
}: {
  visible: boolean;
  title: string;
  /** e.g. "Mark 14". */
  chapterName: string;
  milestoneName: string;
  onClose: () => void;
  onOpenBook: () => void;
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
