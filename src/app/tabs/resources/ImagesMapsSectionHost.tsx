import React from 'react';
import type { ImagesMapsLoadState } from '../../../hooks/useImagesMapsForUnit';

type ImagesMapsSectionHostProps = {
  state: ImagesMapsLoadState;
  retry: () => void;
};

/**
 * Lazily require the Images & Maps body so `react-native-reanimated` /
 * worklets only load when the section is expanded (not when ResourcesTab mounts).
 */
export function ImagesMapsSectionHost(props: ImagesMapsSectionHostProps) {
  const { ImagesMapsSection } =
    require('./ImagesMapsSection') as typeof import('./ImagesMapsSection');
  return <ImagesMapsSection {...props} />;
}
