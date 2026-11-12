import React from 'react';
import { Text, View } from 'react-native';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CaretRight,
  Check,
  CheckBold,
  Cloud,
  CloudArrowDown,
  CloudArrowUp,
  CloudCheck,
  CloudSlash,
  CloudWarning,
  EjectFill,
  Gear,
  Headphones,
  Notebook,
  PauseFill,
  PlayFill,
  RecordFill,
  SignOut,
  SkipBackFill,
  SkipForwardFill,
  StopFill,
  UndoBold,
  UserPlus,
  UserSound,
  Warning,
  Waveform,
  X,
  type NextIcon,
} from '../../../components/ui/icons';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

/** Grouped by weight: Regular, then Bold, then the transport keys' Fill. */
const ICONS: { name: string; Icon: NextIcon }[] = [
  { name: 'ArrowDown', Icon: ArrowDown },
  { name: 'ArrowLeft', Icon: ArrowLeft },
  { name: 'ArrowRight', Icon: ArrowRight },
  { name: 'CaretRight', Icon: CaretRight },
  { name: 'Check', Icon: Check },
  { name: 'Cloud', Icon: Cloud },
  { name: 'CloudArrowDown', Icon: CloudArrowDown },
  { name: 'CloudArrowUp', Icon: CloudArrowUp },
  { name: 'CloudCheck', Icon: CloudCheck },
  { name: 'CloudSlash', Icon: CloudSlash },
  { name: 'CloudWarning', Icon: CloudWarning },
  { name: 'Gear', Icon: Gear },
  { name: 'Headphones', Icon: Headphones },
  { name: 'Notebook', Icon: Notebook },
  { name: 'SignOut', Icon: SignOut },
  { name: 'UserPlus', Icon: UserPlus },
  { name: 'UserSound', Icon: UserSound },
  { name: 'Warning', Icon: Warning },
  { name: 'Waveform', Icon: Waveform },
  { name: 'X', Icon: X },
  { name: 'CheckBold', Icon: CheckBold },
  { name: 'UndoBold', Icon: UndoBold },
  { name: 'PlayFill', Icon: PlayFill },
  { name: 'PauseFill', Icon: PauseFill },
  { name: 'SkipBackFill', Icon: SkipBackFill },
  { name: 'SkipForwardFill', Icon: SkipForwardFill },
  { name: 'RecordFill', Icon: RecordFill },
  { name: 'EjectFill', Icon: EjectFill },
  { name: 'StopFill', Icon: StopFill },
];

/** Every Next icon at 24, the size most controls use, named as it's imported. */
export function IconsEntry() {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: t.spacing.lg },
    cell: { width: '33.33%', alignItems: 'center', gap: t.spacing.xs },
    name: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.grid}>
      {ICONS.map(({ name, Icon }) => (
        <View key={name} style={styles.cell} testID={`gallery-icon-${name}`}>
          <Icon
            color={theme.roles.fgPrimary}
            size={theme.controlSizes.icon24}
          />
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
    </View>
  );
}
