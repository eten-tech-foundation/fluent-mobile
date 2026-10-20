import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';

/** Top/bottom padding for stack/page headers that extend under the status bar. */
export function useHeaderSafeAreaPadding() {
  const insets = useSafeAreaInsets();
  const { headerLayout } = useTheme();

  return {
    paddingTop: insets.top + headerLayout.paddingVertical,
    paddingBottom: headerLayout.paddingVertical,
  };
}
