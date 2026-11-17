import React from 'react';
import { Modal } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { PassageImages } from './PassageImages';
import type { PassageImagesState } from './usePassageImages';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const actualReact = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    GestureHandlerRootView: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    }) => actualReact.createElement(View, props, children),
  };
});

/** Images whose asset fails as soon as it renders. */
let mockFailing = new Set<string>();

jest.mock('../../../tabs/resources/ZoomableImage', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    ZoomableImage: ({
      uri,
      onLoadError,
      onPress,
      testID,
    }: {
      uri: string;
      onLoadError?: () => void;
      onPress?: () => void;
      testID?: string;
    }) => {
      React.useLayoutEffect(() => {
        if ([...mockFailing].some(id => uri.includes(id))) onLoadError?.();
      }, [uri, onLoadError]);
      return <Pressable testID={testID} onPress={onPress} />;
    },
  };
});

const MAP: ImagesMapsItem = {
  id: 'img-api-1',
  title: 'Jerusalem',
  caption: 'The city and the temple',
  attribution: 'Bible Journey Maps',
  uri: 'https://example.org/jerusalem.jpg',
  thumbnailUri: 'https://example.org/jerusalem-thumb.jpg',
};
const ROOM: ImagesMapsItem = {
  id: 'img-api-2',
  title: 'Upper room',
  uri: 'https://example.org/room.jpg',
};

const ready = (...items: ImagesMapsItem[]): PassageImagesState => ({
  status: 'ready',
  items,
});

function renderImages(
  state: PassageImagesState,
  onRetry: () => void = jest.fn(),
  scope = 'scope-a',
) {
  return render(
    <PassageImages scope={scope} state={state} onRetry={onRetry} />,
  );
}

const viewerVisible = () =>
  screen.UNSAFE_getByType(Modal).props.visible as boolean;

describe('PassageImages', () => {
  beforeEach(() => {
    mockFailing = new Set();
  });

  it.each([
    [{ status: 'loading' }, 'passage-images-loading'],
    [{ status: 'unprepared' }, 'passage-images-unprepared'],
    [{ status: 'noneOffline' }, 'passage-images-none-offline'],
    [{ status: 'noVerses' }, 'passage-images-no-text'],
    [{ status: 'failed' }, 'passage-images-error'],
    [ready(), 'passage-images-empty'],
  ] as [PassageImagesState, string][])(
    'shows exactly one state for %j',
    (state, testID) => {
      renderImages(state);
      for (const id of [
        'passage-images-loading',
        'passage-images-unprepared',
        'passage-images-none-offline',
        'passage-images-no-text',
        'passage-images-error',
        'passage-images-empty',
        'passage-images-list',
      ]) {
        if (id === testID) expect(screen.getByTestId(id)).toBeTruthy();
        else expect(screen.queryByTestId(id)).toBeNull();
      }
    },
  );

  it('shows the metadata it has and invents none', () => {
    renderImages(ready(MAP, ROOM));
    const map = screen.getByTestId('passage-image-img-api-1');
    expect(within(map).getByText('Jerusalem')).toBeTruthy();
    expect(within(map).getByText('The city and the temple')).toBeTruthy();
    expect(within(map).getByText('Bible Journey Maps')).toBeTruthy();
    const room = screen.getByTestId('passage-image-img-api-2');
    expect(within(room).getAllByText(/./)).toHaveLength(1);
  });

  it('Retry on a failed load calls only the loader', () => {
    const onRetry = jest.fn();
    renderImages({ status: 'failed' }, onRetry);
    fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading images and maps' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the images that loaded when one fails', () => {
    mockFailing = new Set(['room']);
    renderImages(ready(MAP, ROOM));
    expect(screen.getByTestId('passage-images-list')).toBeTruthy();
    expect(screen.getByTestId('passage-image-img-api-2-failed')).toBeTruthy();
    expect(screen.queryByTestId('passage-image-img-api-1-failed')).toBeNull();
    fireEvent.press(
      screen.getByRole('button', { name: 'Open Jerusalem full screen' }),
    );
    expect(viewerVisible()).toBe(true);
  });

  it('reads every image failing as a failed load with Retry, not as empty', () => {
    mockFailing = new Set(['jerusalem', 'room']);
    const onRetry = jest.fn();
    const view = renderImages(ready(MAP, ROOM), onRetry);
    expect(screen.getByTestId('passage-images-error')).toBeTruthy();
    expect(screen.queryByTestId('passage-images-empty')).toBeNull();

    mockFailing = new Set();
    fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading images and maps' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    view.rerender(
      <PassageImages
        scope="scope-a"
        state={ready(MAP, ROOM)}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('passage-images-list')).toBeTruthy();
  });

  it('opens full screen from the button or a tap on the image', () => {
    renderImages(ready(MAP));
    expect(viewerVisible()).toBe(false);
    fireEvent.press(screen.getByTestId('passage-image-img-api-1-zoom'));
    expect(viewerVisible()).toBe(true);
    expect(
      within(screen.getByTestId('passage-image-viewer')).getByText('Jerusalem'),
    ).toBeTruthy();
  });

  it('closes full screen with Close and with Android Back alike', () => {
    renderImages(ready(MAP));
    const open = () =>
      fireEvent.press(
        screen.getByRole('button', { name: 'Open Jerusalem full screen' }),
      );

    open();
    fireEvent.press(screen.getByTestId('passage-image-viewer-close'));
    expect(viewerVisible()).toBe(false);

    open();
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(viewerVisible()).toBe(false);
    expect(screen.getByTestId('passage-images-list')).toBeTruthy();
  });

  it('closes an open image and clears failures when the images are for something else', () => {
    mockFailing = new Set(['room']);
    const view = renderImages(ready(MAP, ROOM));
    fireEvent.press(
      screen.getByRole('button', { name: 'Open Jerusalem full screen' }),
    );
    expect(viewerVisible()).toBe(true);

    mockFailing = new Set();
    view.rerender(
      <PassageImages
        scope="scope-b"
        state={ready(MAP, ROOM)}
        onRetry={jest.fn()}
      />,
    );
    expect(viewerVisible()).toBe(false);
    expect(screen.queryByTestId('passage-image-img-api-2-failed')).toBeNull();
  });

  it('keeps an old viewer or failure from coming back after a reload', () => {
    mockFailing = new Set(['room']);
    const onRetry = jest.fn();
    const view = renderImages(ready(MAP, ROOM), onRetry);
    fireEvent.press(
      screen.getByRole('button', { name: 'Open Jerusalem full screen' }),
    );
    expect(viewerVisible()).toBe(true);

    // e.g. connectivity flips and the same images load again.
    mockFailing = new Set();
    view.rerender(
      <PassageImages
        scope="scope-a"
        state={{ status: 'loading' }}
        onRetry={onRetry}
      />,
    );
    view.rerender(
      <PassageImages
        scope="scope-a"
        state={ready(MAP, ROOM)}
        onRetry={onRetry}
      />,
    );
    expect(viewerVisible()).toBe(false);
    expect(screen.queryByTestId('passage-image-img-api-2-failed')).toBeNull();
  });
});
