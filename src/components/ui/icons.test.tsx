import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { IconProps } from 'phosphor-react-native';
import * as icons from './icons';
import type { HostInstance } from '../../test/hostElements';

type PhosphorIcon = React.ComponentType<IconProps>;
const PlayIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Play').PlayIcon;
const ArrowRightIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowRight').ArrowRightIcon;

/** Whether a host element of the given type is rendered at or below `node`. */
function hasHostType(node: HostInstance | string, type: string): boolean {
  if (typeof node === 'string') return false;
  if ((node.type as unknown) === type) return true;
  return node.children.some(child => hasHostType(child, type));
}

describe('Next UI icons', () => {
  it.each(Object.entries(icons))(
    '%s renders with color and size',
    async (_name, Icon) => {
      await render(<Icon color="#123456" size={24} />);
      expect(screen.root && hasHostType(screen.root, 'RNSVGSvgView')).toBe(
        true,
      );
    },
  );

  it('gives transport keys the Fill weight and the rest Regular', async () => {
    const { toJSON: fill } = await render(
      <icons.PlayFill color="#000" size={24} />,
    );
    const filled = JSON.stringify(fill());
    const { toJSON: regular } = await render(
      <PlayIcon color="#000" size={24} weight="regular" />,
    );
    const { toJSON: fillDirect } = await render(
      <PlayIcon color="#000" size={24} weight="fill" />,
    );
    expect(filled).toEqual(JSON.stringify(fillDirect()));
    expect(filled).not.toEqual(JSON.stringify(regular()));

    const { toJSON: arrow } = await render(
      <icons.ArrowRight color="#000" size={24} />,
    );
    const { toJSON: arrowRegular } = await render(
      <ArrowRightIcon color="#000" size={24} weight="regular" />,
    );
    expect(JSON.stringify(arrow())).toEqual(JSON.stringify(arrowRegular()));
  });
});
