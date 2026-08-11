import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ImagesMapsSection } from './ImagesMapsSection';
import { IMAGES_MAPS_LOAD_ERROR } from '../../../constants/messages';
import { setMockImagesMapsLoadFailure } from '../../../mocks/resources/imagesMapsMock';

jest.mock('react-native-gesture-handler', () => {
  const actualReact = jest.requireActual('react');
  const chainable = () => {
    const gesture: Record<string, unknown> = {};
    [
      'onUpdate',
      'onEnd',
      'onTouchesMove',
      'activeOffsetX',
      'failOffsetY',
      'maxPointers',
      'manualActivation',
      'numberOfTaps',
    ].forEach(method => {
      gesture[method] = () => gesture;
    });
    return gesture;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      actualReact.createElement(actualReact.Fragment, null, children),
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    }) =>
      actualReact.createElement(require('react-native').View, props, children),
    Gesture: {
      Pan: chainable,
      Pinch: chainable,
      Tap: chainable,
      Simultaneous: () => chainable(),
      Exclusive: () => chainable(),
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('ImagesMapsSection', () => {
  afterEach(() => {
    setMockImagesMapsLoadFailure(false);
  });

  it('hides content when no images are available', async () => {
    render(<ImagesMapsSection chapterId={99} verseNumber={1} />);

    await waitFor(() => {
      expect(screen.queryByTestId('images-maps-loading')).toBeNull();
    });
    expect(screen.queryByTestId('images-maps-list')).toBeNull();
    expect(screen.queryByTestId('images-maps-error')).toBeNull();
  });

  it('shows titles, captions, and attribution for mock items', async () => {
    render(<ImagesMapsSection chapterId={99} verseNumber={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });

    expect(screen.getByText('Jerusalem region map')).toBeTruthy();
    expect(screen.getByText('Overview of surrounding towns')).toBeTruthy();
    expect(screen.getByText('Aquifer / Bible Journey Maps')).toBeTruthy();
  });

  it('opens fullscreen when maximize is pressed', async () => {
    render(<ImagesMapsSection chapterId={99} verseNumber={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('images-maps-maximize-img-99-2-1'));

    expect(screen.getByTestId('images-maps-fullscreen')).toBeTruthy();
    fireEvent.press(screen.getByTestId('images-maps-fullscreen-close'));
    expect(screen.queryByTestId('images-maps-fullscreen')).toBeNull();
  });

  it('shows section-scoped error and recovers on Retry', async () => {
    setMockImagesMapsLoadFailure(true);

    render(<ImagesMapsSection chapterId={99} verseNumber={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-error')).toBeTruthy();
    });
    expect(screen.getByText(IMAGES_MAPS_LOAD_ERROR)).toBeTruthy();

    setMockImagesMapsLoadFailure(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('images-maps-retry'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    });
  });
});
