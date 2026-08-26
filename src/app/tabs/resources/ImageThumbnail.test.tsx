import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ImageThumbnail } from './ImageThumbnail';
import { getMockImagesMaps } from '../../../mocks/resources/imagesMapsMock';

const mockZoomableImage = jest.fn();

jest.mock('./ZoomableImage', () => ({
  ZoomableImage: (props: { testID?: string; onLoad?: () => void }) => {
    mockZoomableImage(props);
    const { View } = require('react-native');
    return <View testID={props.testID} />;
  },
}));

describe('ImageThumbnail', () => {
  beforeEach(() => {
    mockZoomableImage.mockClear();
  });

  it('shows a loading indicator until the image finishes loading', () => {
    const item = getMockImagesMaps(99, 2)[0];

    render(<ImageThumbnail item={item} onOpenFullscreen={() => undefined} />);

    expect(
      screen.getByTestId(`images-maps-image-loading-${item.id}`),
    ).toBeTruthy();
  });

  it('hides the loading indicator after the image loads', () => {
    const item = getMockImagesMaps(99, 2)[0];

    render(<ImageThumbnail item={item} onOpenFullscreen={() => undefined} />);

    const onLoad = mockZoomableImage.mock.calls[0]?.[0]?.onLoad;
    act(() => {
      onLoad?.();
    });

    expect(
      screen.queryByTestId(`images-maps-image-loading-${item.id}`),
    ).toBeNull();
  });
});
