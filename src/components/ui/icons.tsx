import React from 'react';
import type { IconProps, IconWeight } from 'phosphor-react-native';

type PhosphorIcon = React.ComponentType<IconProps>;

// One module per icon, since the root bundles every icon. Typed requires so
// TypeScript skips the package's raw source, which fails strict checks in CI.
const ArrowDownIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowDown').ArrowDownIcon;
const ArrowRightIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowRight').ArrowRightIcon;
const CircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Circle').CircleIcon;
const EjectIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Eject').EjectIcon;
const HeadphonesIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Headphones').HeadphonesIcon;
const PauseIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Pause').PauseIcon;
const PlayIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Play').PlayIcon;
const SkipBackIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SkipBack').SkipBackIcon;
const SkipForwardIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SkipForward').SkipForwardIcon;
const UserSoundIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/UserSound').UserSoundIcon;
const WaveformIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Waveform').WaveformIcon;

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
export const EjectFill = weighted(EjectIcon, 'fill', 'EjectFill');
