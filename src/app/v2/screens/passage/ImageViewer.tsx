import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '../../../../components/ui/icons';
import {
  PASSAGE_IMAGE_CLOSE,
  PASSAGE_IMAGE_UNAVAILABLE,
} from '../../../../constants/messages';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import { ZoomableImage } from '../../../tabs/resources/ZoomableImage';

/** Room to tap Close, whatever the text size. */
const MIN_TARGET = 48;

/**
 * One image or map full screen, with the same pinch, pan and double-tap as
 * its card. Close and Android Back both close it, back to the sheet.
 */
export function ImageViewer({
  item,
  onClose,
}: {
  item: ImagesMapsItem | null;
  onClose: () => void;
}) {
  const { controlSizes, roles } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(t => ({
    root: { flex: 1, backgroundColor: t.roles.surfaceInverse },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
    },
    text: { flex: 1, gap: t.spacing.xxs, paddingTop: t.spacing.sm },
    title: { ...t.type.title, color: t.roles.fgOnInverse },
    detail: { ...t.type.label, color: t.roles.fgOnInverse },
    close: {
      width: MIN_TARGET,
      height: MIN_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.full,
    },
    pressed: { backgroundColor: t.roles.surfaceInverseMuted },
    image: { flex: 1 },
    unavailable: {
      ...t.type.body,
      color: t.roles.fgOnInverse,
      textAlign: 'center',
      marginTop: t.spacing.xxl,
    },
  }));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [item?.id]);

  return (
    <Modal
      visible={item !== null}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root} testID="passage-image-viewer">
        {item ? (
          <>
            <View
              style={[
                styles.header,
                { paddingTop: insets.top + styles.header.paddingBottom },
              ]}
            >
              <View style={styles.text}>
                <Text style={styles.title} accessibilityRole="header">
                  {item.title}
                </Text>
                {item.caption ? (
                  <Text style={styles.detail}>{item.caption}</Text>
                ) : null}
                {item.attribution ? (
                  <Text style={styles.detail}>{item.attribution}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                android_disableSound
                accessibilityRole="button"
                accessibilityLabel={PASSAGE_IMAGE_CLOSE}
                style={({ pressed }) => [
                  styles.close,
                  pressed && styles.pressed,
                ]}
                testID="passage-image-viewer-close"
              >
                <X size={controlSizes.icon24} color={roles.fgOnInverse} />
              </Pressable>
            </View>
            {failed ? (
              <Text style={styles.unavailable}>
                {PASSAGE_IMAGE_UNAVAILABLE}
              </Text>
            ) : (
              <ZoomableImage
                uri={item.uri}
                accessibilityLabel={item.title}
                style={[styles.image, { marginBottom: insets.bottom }]}
                contentFit="contain"
                hostBackgroundColor={roles.surfaceInverse}
                onLoadError={() => setFailed(true)}
                testID="passage-image-viewer-image"
              />
            )}
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
