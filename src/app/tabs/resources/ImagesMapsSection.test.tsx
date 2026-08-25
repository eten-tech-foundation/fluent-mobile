import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ImagesMapsSection } from './ImagesMapsSection';
import { IMAGES_MAPS_LOAD_ERROR } from '../../../constants/messages';
import { getMockImagesMaps } from '../../../mocks/resources/imagesMapsMock';

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

/** When true, ZoomableImage immediately reports load failure (offline asset path). */
let mockAutoFailZoomableImages = false;

jest.mock('./ZoomableImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ZoomableImage: ({
      onLoadError,
      testID,
    }: {
      onLoadError?: () => void;
      testID?: string;
    }) => {
      React.useLayoutEffect(() => {
        if (mockAutoFailZoomableImages) {
          onLoadError?.();
        }
      }, [onLoadError]);
      return <View testID={testID} />;
    },
  };
});

describe('ImagesMapsSection', () => {
  beforeEach(() => {
    mockAutoFailZoomableImages = false;
  });

  it('renders nothing when ready with no items (parent hides accordion)', () => {
    const { toJSON } = render(
      <ImagesMapsSection
        state={{ status: 'ready', items: [] }}
        retry={() => undefined}
      />,
    );

    expect(toJSON()).toBeNull();
    expect(screen.queryByTestId('images-maps-list')).toBeNull();
    expect(screen.queryByTestId('images-maps-empty')).toBeNull();
  });

  it('shows a loading spinner while items are loading', () => {
    render(
      <ImagesMapsSection
        state={{ status: 'loading' }}
        retry={() => undefined}
      />,
    );

    expect(screen.getByTestId('images-maps-loading')).toBeTruthy();
  });

  it('shows titles, captions, and attribution for items', () => {
    render(
      <ImagesMapsSection
        state={{ status: 'ready', items: getMockImagesMaps(99, 2) }}
        retry={() => undefined}
      />,
    );

    expect(screen.getByTestId('images-maps-list')).toBeTruthy();
    expect(screen.getByText('Jerusalem region map')).toBeTruthy();
    expect(screen.getByText('Overview of surrounding towns')).toBeTruthy();
    expect(screen.getByText('Aquifer / Bible Journey Maps')).toBeTruthy();
  });

  it('opens fullscreen when maximize is pressed', () => {
    render(
      <ImagesMapsSection
        state={{ status: 'ready', items: getMockImagesMaps(99, 2) }}
        retry={() => undefined}
      />,
    );

    fireEvent.press(screen.getByTestId('images-maps-maximize-img-99-2-1'));

    expect(screen.getByTestId('images-maps-fullscreen')).toBeTruthy();
    fireEvent.press(screen.getByTestId('images-maps-fullscreen-close'));
    expect(screen.queryByTestId('images-maps-fullscreen')).toBeNull();
  });

  it('shows section-scoped error and recovers on Retry', () => {
    const retry = jest.fn();
    const { rerender } = render(
      <ImagesMapsSection
        state={{ status: 'error', message: IMAGES_MAPS_LOAD_ERROR }}
        retry={retry}
      />,
    );

    expect(screen.getByTestId('images-maps-error')).toBeTruthy();
    expect(screen.getByText(IMAGES_MAPS_LOAD_ERROR)).toBeTruthy();

    fireEvent.press(screen.getByTestId('images-maps-retry'));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(
      <ImagesMapsSection
        state={{ status: 'ready', items: getMockImagesMaps(99, 2) }}
        retry={retry}
      />,
    );

    expect(screen.getByTestId('images-maps-list')).toBeTruthy();
  });

  it('escalates all thumbnail load failures to error + Retry', async () => {
    mockAutoFailZoomableImages = true;
    const retry = jest.fn();
    const items = getMockImagesMaps(99, 2);

    render(
      <ImagesMapsSection state={{ status: 'ready', items }} retry={retry} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('images-maps-error')).toBeTruthy();
    });
    expect(screen.getByText(IMAGES_MAPS_LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByTestId('images-maps-list')).toBeNull();

    fireEvent.press(screen.getByTestId('images-maps-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
