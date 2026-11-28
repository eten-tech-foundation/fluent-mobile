import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  PASSAGE_QUESTIONS_EMPTY,
  PASSAGE_QUESTIONS_NO_TEXT,
  PASSAGE_QUESTIONS_UNPREPARED,
  TRANSLATION_QUESTION_NO_ANSWER,
  TRANSLATION_QUESTIONS_LOAD_ERROR,
} from '../../../../constants/messages';
import { PassageQuestions } from './PassageQuestions';
import type { PassageQuestionsState } from './usePassageQuestions';

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    activeOffsetY: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  const Pass = ({ children }: { children: React.ReactNode }) => children;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: Pass,
    GestureHandlerRootView: Pass,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const READY: PassageQuestionsState = {
  status: 'ready',
  questions: [
    { id: 'q1', question: 'Who came?', answer: 'The priests.' },
    { id: 'q2', question: 'Why wait?', answer: '' },
  ],
};

type Props = Partial<React.ComponentProps<typeof PassageQuestions>>;

function sheet(props: Props = {}) {
  return (
    <PassageQuestions
      visible
      scopeLabel="Mark 14:1-2"
      scope="a"
      state={READY}
      onRetry={jest.fn()}
      onClose={jest.fn()}
      {...props}
    />
  );
}

describe('PassageQuestions', () => {
  it('shows loading, not an empty or offline message', async () => {
    await render(sheet({ state: { status: 'loading' } }));
    expect(screen.getByTestId('passage-questions-loading')).toBeTruthy();
    expect(screen.queryByText(PASSAGE_QUESTIONS_EMPTY)).toBeNull();
    expect(screen.queryByText(PASSAGE_QUESTIONS_UNPREPARED)).toBeNull();
  });

  it('tells empty, unprepared and failed apart', async () => {
    const { rerender } = await render(
      sheet({ state: { status: 'ready', questions: [] } }),
    );
    expect(screen.getByText(PASSAGE_QUESTIONS_EMPTY)).toBeTruthy();

    await rerender(sheet({ state: { status: 'unprepared' } }));
    expect(screen.getByText(PASSAGE_QUESTIONS_UNPREPARED)).toBeTruthy();
    expect(screen.queryByText(PASSAGE_QUESTIONS_EMPTY)).toBeNull();

    await rerender(sheet({ state: { status: 'noVerses' } }));
    expect(screen.getByText(PASSAGE_QUESTIONS_NO_TEXT)).toBeTruthy();
    expect(screen.queryByText(PASSAGE_QUESTIONS_EMPTY)).toBeNull();

    await rerender(sheet({ state: { status: 'failed' } }));
    expect(screen.getByText(TRANSLATION_QUESTIONS_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText(PASSAGE_QUESTIONS_UNPREPARED)).toBeNull();
  });

  it('offers Retry on a failure', async () => {
    const onRetry = jest.fn();
    await render(sheet({ state: { status: 'failed' }, onRetry }));
    await fireEvent.press(
      screen.getByLabelText('Retry loading Translation Questions'),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens and closes an answer, saying which it is', async () => {
    await render(sheet());
    const toggle = screen.getByTestId('passage-question-q1-toggle');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(toggle.props.accessibilityHint).toBe('Shows the answer');
    expect(screen.queryByText('The priests.')).toBeNull();

    await fireEvent.press(toggle);
    expect(screen.getByText('The priests.')).toBeTruthy();
    const open = screen.getByTestId('passage-question-q1-toggle');
    expect(open.props.accessibilityState).toEqual({ expanded: true });
    expect(open.props.accessibilityHint).toBe('Hides the answer');

    await fireEvent.press(open);
    expect(screen.queryByText('The priests.')).toBeNull();
  });

  it('says when a question has no answer', async () => {
    await render(sheet());
    await fireEvent.press(screen.getByTestId('passage-question-q2-toggle'));
    expect(screen.getByText(TRANSLATION_QUESTION_NO_ANSWER)).toBeTruthy();
  });

  it('closes open answers when the questions are for something else', async () => {
    const { rerender } = await render(sheet());
    await fireEvent.press(screen.getByTestId('passage-question-q1-toggle'));
    expect(screen.getByText('The priests.')).toBeTruthy();

    await rerender(sheet({ scope: 'b' }));
    expect(screen.queryByText('The priests.')).toBeNull();
  });

  it('closes open answers with the sheet', async () => {
    const { rerender } = await render(sheet());
    await fireEvent.press(screen.getByTestId('passage-question-q1-toggle'));

    await rerender(sheet({ visible: false }));
    await rerender(sheet({ visible: true }));
    expect(screen.queryByText('The priests.')).toBeNull();
  });
});
