import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Circle, Headphones, Speech } from 'lucide-react-native';
import { Key, type KeyIconProps } from '../../../components/ui/Key';
import { Switch } from '../../../components/ui/Switch';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

/** Figma Mode toggle icons are Icon/md. */
const MODE_ICON_SIZE = 20;

function RecordIcon({ color, size }: KeyIconProps) {
  return <Circle color={color} fill={color} size={size} />;
}

/**
 * Mode toggle from the Hardware panel (Figma 2409:538): the Switch picks
 * Listen (off) or Record (on). While a take is recording the mode is locked,
 * so Off, On and Disabled all show up the way they do in the app.
 */
export function SwitchEntry() {
  const theme = useTheme();
  const [recordMode, setRecordMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    status: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
    // Hardware panel key width (Figma Keys row, 2411:465).
    recordKey: { width: 135 },
  }));

  const iconColor = theme.roles.fgSecondary;
  const status = recording
    ? 'Recording a take · stop to switch to Listen'
    : recordMode
    ? 'Record mode'
    : 'Listen mode';

  return (
    <View style={styles.demo}>
      <View style={styles.toggle}>
        <Headphones color={iconColor} size={MODE_ICON_SIZE} />
        <Switch
          value={recordMode}
          onValueChange={setRecordMode}
          accessibilityLabel="Record mode"
          disabled={recording}
          testID="gallery-mode-toggle"
        />
        <Speech color={iconColor} size={MODE_ICON_SIZE} />
      </View>
      <Text style={styles.status}>{status}</Text>
      {recordMode ? (
        <Key
          icon={RecordIcon}
          accessibilityLabel={recording ? 'Stop recording' : 'Record'}
          announceLatched={false}
          active={recording}
          onPress={() => setRecording(r => !r)}
          style={styles.recordKey}
          testID="gallery-record-key"
        />
      ) : null}
    </View>
  );
}
