import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { headerLayout } from '../../theme/iconSpecs';

/** Top/bottom padding for stack/page headers that extend under the status bar. */
export function useHeaderSafeAreaPadding() {
  const insets = useSafeAreaInsets();

  return {
    paddingTop: insets.top + headerLayout.paddingVertical,
    paddingBottom: headerLayout.paddingVertical,
  };
}
