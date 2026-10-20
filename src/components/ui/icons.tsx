import React from 'react';
import type { IconProps, IconWeight } from 'phosphor-react-native';
import { ArrowDownIcon } from 'phosphor-react-native/src/icons/ArrowDown';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { CircleIcon } from 'phosphor-react-native/src/icons/Circle';
import { HeadphonesIcon } from 'phosphor-react-native/src/icons/Headphones';
import { PauseIcon } from 'phosphor-react-native/src/icons/Pause';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { SkipBackIcon } from 'phosphor-react-native/src/icons/SkipBack';
import { SkipForwardIcon } from 'phosphor-react-native/src/icons/SkipForward';
import { UserSoundIcon } from 'phosphor-react-native/src/icons/UserSound';
import { WaveformIcon } from 'phosphor-react-native/src/icons/Waveform';

/** What Next components pass to an `icon` prop. */
export type NextIconProps = { color: string; size: number };
export type NextIcon = React.ComponentType<NextIconProps>;

function weighted(
  Icon: React.ComponentType<IconProps>,
  weight: IconWeight,
  name: string,
): NextIcon {
  const Weighted = (props: NextIconProps) => (
    <Icon {...props} weight={weight} />
  );
  Weighted.displayName = name;
  return Weighted;
}

/**
 * Next UI icons: Figma's Phosphor set, Regular unless noted. Hardware
 * transport keys use Fill. Each icon is imported from its own module, since
 * the package root pulls in every icon and weight.
 */
export const ArrowDown = weighted(ArrowDownIcon, 'regular', 'ArrowDown');
export const ArrowRight = weighted(ArrowRightIcon, 'regular', 'ArrowRight');
export const Headphones = weighted(HeadphonesIcon, 'regular', 'Headphones');
export const UserSound = weighted(UserSoundIcon, 'regular', 'UserSound');
export const Waveform = weighted(WaveformIcon, 'regular', 'Waveform');

export const PlayFill = weighted(PlayIcon, 'fill', 'PlayFill');
export const PauseFill = weighted(PauseIcon, 'fill', 'PauseFill');
export const SkipBackFill = weighted(SkipBackIcon, 'fill', 'SkipBackFill');
export const SkipForwardFill = weighted(
  SkipForwardIcon,
  'fill',
  'SkipForwardFill',
);
export const RecordFill = weighted(CircleIcon, 'fill', 'RecordFill');
