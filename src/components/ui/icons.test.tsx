import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import * as icons from './icons';

describe('Next UI icons', () => {
  it.each(Object.entries(icons))(
    '%s renders with color and size',
    (_name, Icon) => {
      render(<Icon color="#123456" size={24} />);
      const svg = screen.UNSAFE_root.findAll(
        node => (node.type as unknown) === 'RNSVGSvgView',
      );
      expect(svg.length).toBeGreaterThan(0);
    },
  );

  it('gives transport keys the Fill weight and the rest Regular', () => {
    const { toJSON: fill } = render(<icons.PlayFill color="#000" size={24} />);
    const filled = JSON.stringify(fill());
    const { toJSON: regular } = render(
      <PlayIcon color="#000" size={24} weight="regular" />,
    );
    const { toJSON: fillDirect } = render(
      <PlayIcon color="#000" size={24} weight="fill" />,
    );
    expect(filled).toEqual(JSON.stringify(fillDirect()));
    expect(filled).not.toEqual(JSON.stringify(regular()));
  });
});
