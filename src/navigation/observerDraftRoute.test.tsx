import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ObserverDraftRoute from '../routes/(app)/(stack)/observer-draft';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    chapterAssignmentId: '1001',
    projectId: '9',
  }),
}));

jest.mock('../app/screens/ObserverDraftScreen', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Legacy observer</Text>;
  },
}));

jest.mock('../app/v2/screens/ObserverScreen', () => ({
  __esModule: true,
  default: function NextObserverRouteScreen() {
    const { Text } = require('react-native');
    const { useLocalSearchParams } = require('expo-router');
    const params = useLocalSearchParams();
    return (
      <Text>{`Next observer ${params.chapterAssignmentId} ${params.projectId}`}</Text>
    );
  },
}));

describe('observer-draft route', () => {
  it('shows the Next Observer screen', async () => {
    await render(<ObserverDraftRoute />);
    expect(screen.getByText('Next observer 1001 9')).toBeTruthy();
    expect(screen.queryByText('Legacy observer')).toBeNull();
  });
});
