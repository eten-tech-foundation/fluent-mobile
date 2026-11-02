import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DraftDownloadChip } from './DraftDownloadChip';
import type { DraftDownloadState } from '../../types/draftDownload/types';

jest.mock('lucide-react-native', () => {
  const ReactNative = require('react-native');
  const Mock = (props: { testID?: string }) => (
    <ReactNative.View testID={props.testID} />
  );
  return { CloudCheck: Mock, CloudOff: Mock };
});

const baseState: DraftDownloadState = {
  chapterAssignmentId: 9,
  role: 'peer_check',
  status: 'idle',
  phase: 'idle',
  progress: 0,
  readyAtMs: null,
};

describe('DraftDownloadChip', () => {
  it('invokes onPress for idle/failed chips (manual start / retry)', () => {
    const onPress = jest.fn();
    const view = render(
      <DraftDownloadChip state={baseState} onPress={onPress} />,
    );
    fireEvent.press(view.getByTestId('draft-download-chip'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows ready cloud-check and disables press', () => {
    const onPress = jest.fn();
    const view = render(
      <DraftDownloadChip
        state={{
          ...baseState,
          status: 'ready',
          phase: 'complete',
          progress: 1,
          readyAtMs: Date.now(),
        }}
        onPress={onPress}
      />,
    );
    expect(view.getByTestId('draft-download-chip-ready')).toBeTruthy();
    fireEvent.press(view.getByTestId('draft-download-chip'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders progress ring state while downloading', () => {
    const view = render(
      <DraftDownloadChip
        state={{
          ...baseState,
          status: 'downloading',
          phase: 'audio',
          progress: 0.4,
        }}
        onPress={jest.fn()}
      />,
    );
    expect(view.getByTestId('draft-download-chip-idle')).toBeTruthy();
  });
});
