import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ChaptersRoute from '../routes/(app)/(stack)/chapters';
import { hrefs } from './hrefs';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    projectId: '9',
    projectUnitId: '3',
    projectName: 'Mark Telugu',
    milestoneName: 'Gospels Phase 1',
    language: 'Telugu',
    focusChapterId: '5',
  }),
}));

jest.mock('../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../app/tabs/ViewProject', () => ({
  __esModule: true,
  default: () => {
    const { Text } = require('react-native');
    return <Text>Legacy chapters</Text>;
  },
}));

jest.mock('../app/v2/screens/BookScreen', () => ({
  __esModule: true,
  default: function NextBookRouteScreen() {
    const { Text } = require('react-native');
    const { useLocalSearchParams } = require('expo-router');
    const params = useLocalSearchParams();
    return (
      <Text>{`Next book ${params.projectId} ${params.projectUnitId} ${params.focusChapterId}`}</Text>
    );
  },
}));

describe('chapters route', () => {
  it('shows the book page', async () => {
    await render(<ChaptersRoute />);
    expect(screen.getByText('Next book 9 3 5')).toBeTruthy();
    expect(screen.queryByText('Legacy chapters')).toBeNull();
  });

  it('keeps project, unit and focus on the book href', () => {
    expect(
      hrefs.chapters({
        projectId: 9,
        projectUnitId: 3,
        projectName: 'Mark Telugu',
        milestoneName: 'Gospels Phase 1',
        language: 'Telugu',
        focusChapterId: 5,
      }).params,
    ).toMatchObject({
      projectId: '9',
      projectUnitId: '3',
      focusChapterId: '5',
    });
  });
});
