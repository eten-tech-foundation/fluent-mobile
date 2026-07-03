import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { VerseNav } from './VerseNav';

describe('VerseNav', () => {
  it('renders the reference', () => {
    render(
      <VerseNav
        reference="Mark 14:3"
        prevDisabled={false}
        nextDisabled={false}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );

    expect(screen.getByTestId('record-verse-reference')).toHaveTextContent(
      'Mark 14:3',
    );
  });

  it('disables chevrons when prevDisabled or nextDisabled are true', () => {
    render(
      <VerseNav
        reference="Mark 14:2"
        prevDisabled={true}
        nextDisabled={true}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('record-prev-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      screen.getByTestId('record-next-verse').props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('calls onPrev and onNext when enabled', () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();

    render(
      <VerseNav
        reference="Mark 14:2"
        prevDisabled={false}
        nextDisabled={false}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    fireEvent.press(screen.getByTestId('record-prev-verse'));
    fireEvent.press(screen.getByTestId('record-next-verse'));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('does not call handlers when disabled', () => {
    const onPrev = jest.fn();
    const onNext = jest.fn();

    render(
      <VerseNav
        reference="Mark 14:1"
        prevDisabled={true}
        nextDisabled={true}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    fireEvent.press(screen.getByTestId('record-prev-verse'));
    fireEvent.press(screen.getByTestId('record-next-verse'));

    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
