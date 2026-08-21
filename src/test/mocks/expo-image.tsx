import React from 'react';
import { View, type ViewProps } from 'react-native';

type MockImageProps = ViewProps & {
  source?: { uri?: string } | string | number;
  onError?: () => void;
  accessibilityLabel?: string;
};

/**
 * Lightweight expo-image stand-in for Jest (no native Glide/SDWebImage).
 */
export function Image({ onError: _onError, ...props }: MockImageProps) {
  return <View {...props} />;
}

export default { Image };
