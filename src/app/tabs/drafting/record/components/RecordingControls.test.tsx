import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RecordingControls } from './RecordingControls';
import { RecorderStatus } from '../../../../../types/recording/types';

const REFERENCE = 'Mark 14:3';

describe('RecordingControls', () => {
  it('renders the idle record button with a label and disabled play hint', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Idle}
        reference={REFERENCE}
        elapsedMs={0}
        isPlaying={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-start-button')).toBeTruthy();
    expect(screen.getByTestId('record-start-label')).toHaveTextContent(
      'Record Mark 14:3',
    );
    expect(screen.getByTestId('record-play-idle-placeholder')).toBeTruthy();
  });

  it('shows pause and stop controls with a duration and tip when recording', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Recording}
        reference={REFERENCE}
        elapsedMs={65_420}
        isPlaying={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-duration')).toHaveTextContent('01:05:42');
    expect(screen.getByTestId('record-pause-button')).toBeTruthy();
    expect(screen.getByTestId('record-stop-button')).toBeTruthy();
    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'Tap pause to study the source, stop to finish.',
    );
  });

  it('shows the paused tip instead of the recording tip while paused', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Paused}
        reference={REFERENCE}
        elapsedMs={3_000}
        isPlaying={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'Recording paused — review the source below, then resume.',
    );
  });

  it('shows the resume button while paused with a live session', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Paused}
        reference={REFERENCE}
        elapsedMs={3_000}
        isPlaying={false}
        canResume
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-resume-button')).toBeTruthy();
    expect(screen.queryByTestId('record-pause-button')).toBeNull();
    expect(screen.queryByTestId('record-discard-button')).toBeNull();
  });

  it('shows discard instead of resume for a rehydrated paused take', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Paused}
        reference={REFERENCE}
        elapsedMs={3_000}
        isPlaying={false}
        canResume={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onDiscard={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-discard-button')).toBeTruthy();
    expect(screen.queryByTestId('record-resume-button')).toBeNull();
    expect(screen.queryByTestId('record-stop-button')).toBeNull();
    expect(screen.getByTestId('record-tip')).toHaveTextContent(
      'A paused take was recovered from a previous session. Discard it to start fresh.',
    );
  });

  it('renders review controls with placeholder, play, re-record and delete', () => {
    const onDelete = jest.fn();

    render(
      <RecordingControls
        status={RecorderStatus.Review}
        reference={REFERENCE}
        elapsedMs={0}
        isPlaying={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={onDelete}
      />,
    );

    expect(
      screen.getByTestId('record-review-record-done-placeholder'),
    ).toBeTruthy();
    expect(screen.getByTestId('record-play-button')).toBeTruthy();
    expect(screen.getByTestId('record-rerecord-button')).toHaveTextContent(
      'Re-record',
    );
    expect(screen.getByTestId('record-delete-button')).toHaveTextContent(
      'Delete',
    );
    expect(screen.queryByTestId('record-tip')).toBeNull();

    fireEvent.press(screen.getByTestId('record-delete-button'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onTogglePlayback when the review play button is pressed', () => {
    const onTogglePlayback = jest.fn();

    render(
      <RecordingControls
        status={RecorderStatus.Review}
        reference={REFERENCE}
        elapsedMs={0}
        isPlaying={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={onTogglePlayback}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('record-play-button').props.accessibilityLabel,
    ).toBe('Play draft');
    fireEvent.press(screen.getByTestId('record-play-button'));
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);
  });

  it('shows a pause affordance while the draft is playing', () => {
    render(
      <RecordingControls
        status={RecorderStatus.Review}
        reference={REFERENCE}
        elapsedMs={0}
        isPlaying={true}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onStop={jest.fn()}
        onTogglePlayback={jest.fn()}
        onReRecord={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const playButton = screen.getByTestId('record-play-button');
    expect(playButton.props.accessibilityLabel).toBe('Pause draft');
    expect(playButton.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});
