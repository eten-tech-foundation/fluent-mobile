import React from 'react';
import type { IconProps, IconWeight } from 'phosphor-react-native';

type PhosphorIcon = React.ComponentType<IconProps>;

// One module per icon, since the root bundles every icon. Typed requires so
// TypeScript skips the package's raw source, which fails strict checks in CI.
const ArrowDownIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowDown').ArrowDownIcon;
const ArrowLeftIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowLeft').ArrowLeftIcon;
const ArrowRightIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowRight').ArrowRightIcon;
const ArrowUUpLeftIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/ArrowUUpLeft').ArrowUUpLeftIcon;
const CaretRightIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
const CheckIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Check').CheckIcon;
const CircleIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Circle').CircleIcon;
const CloudArrowDownIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudArrowDown').CloudArrowDownIcon;
const CloudArrowUpIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudArrowUp').CloudArrowUpIcon;
const CloudCheckIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudCheck').CloudCheckIcon;
const CloudSlashIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudSlash').CloudSlashIcon;
const CloudWarningIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/CloudWarning').CloudWarningIcon;
const EjectIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Eject').EjectIcon;
const GearIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Gear').GearIcon;
const HeadphonesIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Headphones').HeadphonesIcon;
const PauseIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Pause').PauseIcon;
const PlayIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Play').PlayIcon;
const SignOutIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SignOut').SignOutIcon;
const SkipBackIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SkipBack').SkipBackIcon;
const SkipForwardIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/SkipForward').SkipForwardIcon;
const StopIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Stop').StopIcon;
const UserPlusIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/UserPlus').UserPlusIcon;
const UserSoundIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/UserSound').UserSoundIcon;
const WarningIcon: PhosphorIcon =
  require('phosphor-react-native/src/icons/Warning').WarningIcon;
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
export const ArrowLeft = weighted(ArrowLeftIcon, 'regular', 'ArrowLeft');
export const ArrowRight = weighted(ArrowRightIcon, 'regular', 'ArrowRight');
export const CaretRight = weighted(CaretRightIcon, 'regular', 'CaretRight');
export const Check = weighted(CheckIcon, 'regular', 'Check');
/** Bold, so the heard mark holds its own inside the 3pt Progress ring. */
export const CheckBold = weighted(CheckIcon, 'bold', 'CheckBold');
export const UndoBold = weighted(ArrowUUpLeftIcon, 'bold', 'UndoBold');
export const CloudArrowDown = weighted(
  CloudArrowDownIcon,
  'regular',
  'CloudArrowDown',
);
export const CloudArrowUp = weighted(
  CloudArrowUpIcon,
  'regular',
  'CloudArrowUp',
);
export const CloudCheck = weighted(CloudCheckIcon, 'regular', 'CloudCheck');
export const CloudSlash = weighted(CloudSlashIcon, 'regular', 'CloudSlash');
export const CloudWarning = weighted(
  CloudWarningIcon,
  'regular',
  'CloudWarning',
);
export const Gear = weighted(GearIcon, 'regular', 'Gear');
export const Headphones = weighted(HeadphonesIcon, 'regular', 'Headphones');
export const SignOut = weighted(SignOutIcon, 'regular', 'SignOut');
export const UserPlus = weighted(UserPlusIcon, 'regular', 'UserPlus');
export const UserSound = weighted(UserSoundIcon, 'regular', 'UserSound');
export const Warning = weighted(WarningIcon, 'regular', 'Warning');
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
export const StopFill = weighted(StopIcon, 'fill', 'StopFill');
