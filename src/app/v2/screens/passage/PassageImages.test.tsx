import React from 'react';
import { StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { ownRow, PassageImages } from './PassageImages';
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
/** Each zoom view's last fit, by its uri. */
const mockZoomFits = new Map<string, string | undefined>();
/** Each zoom view's load, by its uri, to fire when a test wants. */
const mockZoomLoads = new Map<
  string,
  (size: { width: number; height: number }) => void
>();
/** Each zoom view mounted, by its uri; a new one starts at 1x. */
const mockZoomMounts: string[] = [];

jest.mock('../../../tabs/resources/ZoomableImage', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    ZoomableImage: ({
      uri,
      onLoad,
      contentFit,
      onLoadError,
      onPress,
      testID,
    }: {
      uri: string;
      onLoad?: (size: { width: number; height: number }) => void;
      contentFit?: string;
      onLoadError?: () => void;
      onPress?: () => void;
      testID?: string;
    }) => {
      if (onLoad) mockZoomLoads.set(uri, onLoad);
      mockZoomFits.set(uri, contentFit);
      React.useLayoutEffect(() => {
        if ([...mockFailing].some(id => uri.includes(id))) onLoadError?.();
      }, [uri, onLoadError]);
      // Runs once per mount.
      React.useState(() => mockZoomMounts.push(uri));
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

async function renderImages(
  state: PassageImagesState,
  onRetry: () => void = jest.fn(),
  scope = 'scope-a',
) {
  const view = await render(
    <PassageImages scope={scope} state={state} onRetry={onRetry} />,
  );
  await layOut();
  return view;
}

/** Tiles size from the list's width, so they wait for its layout. */
async function layOut(y = 0) {
  const list = screen.queryByTestId('passage-images-list');
  if (!list) return;
  await fireEvent(list, 'layout', {
    nativeEvent: { layout: { x: 0, y, width: 300, height: 0 } },
  });
}

/** Six images, 1 to 6, for laying out rows. */
const SIX: ImagesMapsItem[] = [1, 2, 3, 4, 5, 6].map(n => ({
  id: `img-${n}`,
  title: `Image ${n}`,
  uri: `https://example.org/${n}.jpg`,
}));
/** The images' numbers, in the order they show. */
const shown = () =>
  screen
    .getAllByTestId(/^passage-image-img-\d+$/)
    .map(el => Number(String(el.props.testID).split('-').at(-1)));

const grow = (title: string) =>
  fireEvent.press(screen.getByRole('button', { name: title }));
const grown = (id: string) =>
  screen.getByTestId(`passage-image-${id}-toggle`).props.accessibilityState
    .expanded as boolean;

describe('ownRow', () => {
  const nums = [1, 2, 3, 4, 5, 6];
  it.each([
    // Grown index, then the order: it starts its own row, and the rest of
    // its row drops to pair with what follows.
    [0, [1, 2, 3, 4, 5, 6]],
    [1, [2, 1, 3, 4, 5, 6]],
    [2, [1, 2, 3, 4, 5, 6]],
    [3, [1, 2, 4, 3, 5, 6]],
    [4, [1, 2, 3, 4, 5, 6]],
    [5, [1, 2, 3, 4, 6, 5]],
  ])('grows index %i of six as %j', (grownAt, order) => {
    expect(ownRow(nums, grownAt, 2)).toEqual(order);
  });

  it('handles one and two', () => {
    expect(ownRow([1], 0, 2)).toEqual([1]);
    expect(ownRow([1, 2], 1, 2)).toEqual([2, 1]);
  });
});

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
    async (state, testID) => {
      await renderImages(state);
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

  it('shows the metadata it has once grown, and invents none', async () => {
    await renderImages(ready(MAP, ROOM));
    const map = () => screen.getByTestId('passage-image-img-api-1');
    expect(within(map()).getByText('Jerusalem')).toBeTruthy();
    expect(within(map()).queryByText('The city and the temple')).toBeNull();

    await grow('Jerusalem');
    expect(within(map()).getByText('The city and the temple')).toBeTruthy();
    expect(within(map()).getByText('Bible Journey Maps')).toBeTruthy();

    await grow('Upper room');
    const room = screen.getByTestId('passage-image-img-api-2');
    expect(within(room).getAllByText(/./)).toHaveLength(1);
  });

  it('grows one image at a time, from its picture or its words', async () => {
    await renderImages(ready(MAP, ROOM));
    await fireEvent.press(screen.getByTestId('passage-image-img-api-1-zoom'));
    expect(grown('img-api-1')).toBe(true);
    // It grows in place; nothing opens full screen.
    expect(screen.queryByRole('button', { name: /full screen/ })).toBeNull();

    await grow('Upper room');
    expect(grown('img-api-1')).toBe(false);
    expect(grown('img-api-2')).toBe(true);

    await fireEvent.press(screen.getByTestId('passage-image-img-api-2-zoom'));
    expect(grown('img-api-2')).toBe(false);
  });

  it('starts a fresh zoom when an image grows or shrinks', async () => {
    await renderImages(ready(MAP));
    const mounts = () =>
      mockZoomMounts.filter(u => u.includes('jerusalem')).length;
    const before = mounts();
    await grow('Jerusalem');
    expect(mounts()).toBe(before + 1);
    await grow('Jerusalem');
    expect(mounts()).toBe(before + 2);
  });

  it('keeps a grown image in its row, and its row-mate drops to the next', async () => {
    await renderImages(ready(...SIX));
    expect(shown()).toEqual([1, 2, 3, 4, 5, 6]);
    await grow('Image 4');
    expect(shown()).toEqual([1, 2, 4, 3, 5, 6]);
    await grow('Image 4');
    expect(shown()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('says where a grown image landed, once per grow', async () => {
    const onGrown = jest.fn();
    await render(
      <PassageImages
        scope="scope-a"
        state={ready(...SIX)}
        onRetry={jest.fn()}
        onGrown={onGrown}
      />,
    );
    await layOut(40);
    await grow('Image 3');
    const tile = screen.getByTestId('passage-image-img-3');
    const land = async (y: number) =>
      await fireEvent(tile, 'layout', {
        nativeEvent: { layout: { x: 0, y, width: 300, height: 250 } },
      });
    await land(200);
    expect(onGrown).toHaveBeenCalledWith(240, 490);
    await land(210);
    expect(onGrown).toHaveBeenCalledTimes(1);

    // A tile at rest says nothing.
    await fireEvent(screen.getByTestId('passage-image-img-1'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 140, height: 120 } },
    });
    expect(onGrown).toHaveBeenCalledTimes(1);

    // Shrunk and grown again, it says so again.
    await grow('Image 3');
    await grow('Image 3');
    await land(200);
    expect(onGrown).toHaveBeenCalledTimes(2);
  });

  it('says again once a grown image trades its guessed shape for its own', async () => {
    const onGrown = jest.fn();
    await render(
      <PassageImages
        scope="scope-a"
        state={ready(...SIX)}
        onRetry={jest.fn()}
        onGrown={onGrown}
      />,
    );
    await layOut();
    // Grown before its thumbnail is in: the shape is a guess.
    await grow('Image 3');
    const tile = screen.getByTestId('passage-image-img-3');
    const land = async (height: number) =>
      await fireEvent(tile, 'layout', {
        nativeEvent: { layout: { x: 0, y: 100, width: 300, height } },
      });
    await land(250);
    expect(onGrown).toHaveBeenCalledTimes(1);

    await act(() =>
      mockZoomLoads.get('https://example.org/3.jpg')?.({
        width: 200,
        height: 300,
      }),
    );
    await land(480);
    expect(onGrown).toHaveBeenCalledTimes(2);
    expect(onGrown).toHaveBeenLastCalledWith(100, 580);
    await land(480);
    expect(onGrown).toHaveBeenCalledTimes(2);
  });

  it.each([
    // Width by height, then the grown height on a 300 row and its fit.
    ['a wide image at its own shape', 400, 200, 150, 'cover'],
    ['a tall image capped, fitted inside', 200, 600, 450, 'contain'],
  ])('grows %s', async (_label, width, height, grownHeight, fit) => {
    const uri = 'https://example.org/jerusalem-thumb.jpg';
    await renderImages(ready(MAP));
    const previewHeight = () =>
      StyleSheet.flatten(
        screen.getByTestId('passage-image-img-api-1-preview').props.style,
      ).height;
    await act(() => mockZoomLoads.get(uri)?.({ width, height }));
    // Small, every tile is the same 4:3 crop.
    expect(previewHeight()).toBeCloseTo(((300 - 12) / 2) * 0.75);
    expect(mockZoomFits.get(uri)).toBe('cover');

    await grow('Jerusalem');
    expect(previewHeight()).toBeCloseTo(grownHeight);
    expect(mockZoomFits.get(uri)).toBe(fit);
  });

  it('gives a grown image its own row at its whole shape', async () => {
    await renderImages(ready(MAP, ROOM));
    const width = (id: string) =>
      StyleSheet.flatten(screen.getByTestId(`passage-image-${id}`).props.style)
        .width;
    expect(width('img-api-1')).toBe(width('img-api-2'));
    expect(width('img-api-1')).toBeLessThan(300);

    await grow('Jerusalem');
    expect(width('img-api-1')).toBe(300);
  });

  it('Retry on a failed load calls only the loader', async () => {
    const onRetry = jest.fn();
    await renderImages({ status: 'failed' }, onRetry);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading images and maps' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the images that loaded when one fails', async () => {
    mockFailing = new Set(['room']);
    await renderImages(ready(MAP, ROOM));
    expect(screen.getByTestId('passage-images-list')).toBeTruthy();
    expect(screen.getByTestId('passage-image-img-api-2-failed')).toBeTruthy();
    expect(screen.queryByTestId('passage-image-img-api-1-failed')).toBeNull();
    await grow('Jerusalem');
    expect(grown('img-api-1')).toBe(true);
  });

  it('reads every image failing as a failed load with Retry, not as empty', async () => {
    mockFailing = new Set(['jerusalem', 'room']);
    const onRetry = jest.fn();
    const view = await renderImages(ready(MAP, ROOM), onRetry);
    expect(screen.getByTestId('passage-images-error')).toBeTruthy();
    expect(screen.queryByTestId('passage-images-empty')).toBeNull();

    mockFailing = new Set();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry loading images and maps' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.rerender(
      <PassageImages
        scope="scope-a"
        state={ready(MAP, ROOM)}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('passage-images-list')).toBeTruthy();
  });

  it('shrinks a grown image and clears failures when the images are for something else', async () => {
    mockFailing = new Set(['room']);
    const view = await renderImages(ready(MAP, ROOM));
    await grow('Jerusalem');
    expect(grown('img-api-1')).toBe(true);

    mockFailing = new Set();
    await view.rerender(
      <PassageImages
        scope="scope-b"
        state={ready(MAP, ROOM)}
        onRetry={jest.fn()}
      />,
    );
    expect(grown('img-api-1')).toBe(false);
    expect(screen.queryByTestId('passage-image-img-api-2-failed')).toBeNull();
  });

  it('keeps an old grown image or failure from coming back after a reload', async () => {
    mockFailing = new Set(['room']);
    const onRetry = jest.fn();
    const view = await renderImages(ready(MAP, ROOM), onRetry);
    await grow('Jerusalem');
    expect(grown('img-api-1')).toBe(true);

    // e.g. connectivity flips and the same images load again.
    mockFailing = new Set();
    await view.rerender(
      <PassageImages
        scope="scope-a"
        state={{ status: 'loading' }}
        onRetry={onRetry}
      />,
    );
    await view.rerender(
      <PassageImages
        scope="scope-a"
        state={ready(MAP, ROOM)}
        onRetry={onRetry}
      />,
    );
    await layOut();
    expect(grown('img-api-1')).toBe(false);
    expect(screen.queryByTestId('passage-image-img-api-2-failed')).toBeNull();
  });
});
