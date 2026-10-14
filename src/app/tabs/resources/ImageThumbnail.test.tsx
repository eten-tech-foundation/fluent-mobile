import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ImageThumbnail } from './ImageThumbnail';
import { ImagesMapsItem } from '../../../types/resources/imagesMaps';

const mockZoomableImage = jest.fn();

jest.mock('./ZoomableImage', () => ({
  ZoomableImage: (props: { testID?: string; onLoad?: () => void }) => {
    mockZoomableImage(props);
    const { View } = require('react-native');
    return <View testID={props.testID} />;
  },
}));

const SAMPLE_ITEM: ImagesMapsItem = {
  id: 'img-99-2-1',
  title: 'Jerusalem region map',
  caption: 'Overview of surrounding towns',
  attribution: 'Aquifer / Bible Journey Maps',
  uri: 'https://picsum.photos/seed/fluent-map-99-2/800/500',
};

describe('ImageThumbnail', () => {
  beforeEach(() => {
    mockZoomableImage.mockClear();
  });

  it('shows a loading indicator until the image finishes loading', () => {
    render(
      <ImageThumbnail item={SAMPLE_ITEM} onOpenFullscreen={() => undefined} />,
    );

    expect(
      screen.getByTestId(`images-maps-image-loading-${SAMPLE_ITEM.id}`),
    ).toBeTruthy();
  });

  it('hides the loading indicator after the image loads', () => {
    render(
      <ImageThumbnail item={SAMPLE_ITEM} onOpenFullscreen={() => undefined} />,
    );

    const onLoad = mockZoomableImage.mock.calls[0]?.[0]?.onLoad;
    act(() => {
      onLoad?.();
    });

    expect(
      screen.queryByTestId(`images-maps-image-loading-${SAMPLE_ITEM.id}`),
    ).toBeNull();
  });
});
