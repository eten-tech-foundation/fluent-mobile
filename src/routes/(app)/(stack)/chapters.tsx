import React from 'react';
import ViewProject from '../../../app/tabs/ViewProject';
import BookScreen from '../../../app/v2/screens/BookScreen';
import { useUiVersion } from '../../../theme/useTheme';

export default function ChaptersRoute() {
  return useUiVersion() === 'next' ? <BookScreen /> : <ViewProject />;
}
