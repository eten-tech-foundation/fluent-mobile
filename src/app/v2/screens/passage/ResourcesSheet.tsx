import React from 'react';
import { Text } from 'react-native';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import {
  PASSAGE_IMAGES_TITLE,
  PASSAGE_RESOURCES_TITLE,
} from '../../../../constants/messages';
import { useThemedStyles } from '../../../../theme/useTheme';
import { PassageImages } from './PassageImages';
import type { PassageImagesState } from './usePassageImages';

/**
 * What the Resources peek opens: the passage's resources under its
 * reference. Images and maps for now.
 */
export function ResourcesSheet({
  visible,
  reference,
  images,
  onRetryImages,
  onClose,
}: {
  visible: boolean;
  /** e.g. "Mark 14:22–25", or the chapter in verse mode. */
  reference: string;
  images: { state: PassageImagesState; scope: string };
  onRetryImages: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(t => ({
    reference: { ...t.type.label, color: t.roles.fgSecondary },
    heading: {
      ...t.type.title,
      color: t.roles.fgPrimary,
      paddingTop: t.spacing.sm,
    },
  }));
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={PASSAGE_RESOURCES_TITLE}
      testID="passage-resources"
    >
      <Text style={styles.reference}>{reference}</Text>
      <Text style={styles.heading} accessibilityRole="header">
        {PASSAGE_IMAGES_TITLE}
      </Text>
      <PassageImages
        scope={images.scope}
        state={images.state}
        onRetry={onRetryImages}
      />
    </BottomSheet>
  );
}
