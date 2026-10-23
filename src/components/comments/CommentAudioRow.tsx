import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';

export type CommentAudioRowProps = {
  commentId: string;
  audioUri: string;
  /** Parent-owned play state — presentation does not drive a second engine. */
  isPlaying: boolean;
  /**
   * Adapter pending: parent wires verified playback (reuse shared engine when
   * appropriate). This row does not claim live play by itself.
   */
  onPlayPause: (commentId: string, audioUri: string) => void;
  testID?: string;
};

/**
 * Controlled comment-clip audio row. Playback adapter is parent-owned
 * (`ADAPTER_PENDING`); no second playback engine here.
 */
export function CommentAudioRow({
  commentId,
  audioUri,
  isPlaying,
  onPlayPause,
  testID = 'comment-audio-row',
}: CommentAudioRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <TouchableOpacity
        onPress={() => onPlayPause(commentId, audioUri)}
        accessibilityRole="button"
        accessibilityLabel={
          isPlaying ? 'Pause comment audio' : 'Play comment audio'
        }
        testID={`${testID}-play`}
        style={styles.playButton}
      >
        {isPlaying ? (
          <Pause
            size={iconSizes.headerTab}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <Play
            size={iconSizes.headerTab}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>
      <Text style={styles.label} numberOfLines={1}>
        Comment audio
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 44,
    paddingVertical: theme.spacing.xs,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  label: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
