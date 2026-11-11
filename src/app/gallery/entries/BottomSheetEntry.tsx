import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { ListRow } from '../../../components/ui/ListRow';
import { Check, Gear, SignOut, UserPlus } from '../../../components/ui/icons';
import { ACCOUNT_SIGN_OUT_LABEL } from '../../../constants/messages';
import { MAX_DEVICE_ACCOUNTS } from '../../../services/storage';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

const ACCOUNTS = [
  {
    id: '1',
    name: 'Jordan Smith',
    email: 'jordan@example.org',
    initials: 'JS',
  },
  { id: '2', name: 'Ravi Kumar', email: 'ravi@example.org', initials: 'RK' },
  { id: '3', name: 'Ana Lima', email: 'ana@example.org', initials: 'AL' },
];

/**
 * The Accounts sheet's rows. Tap an account to switch, add one up to the
 * limit (the row then disables), and close from the scrim, Back, or a drag
 * down.
 */
export function BottomSheetEntry() {
  const { controlSizes, roles } = useTheme();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const [activeId, setActiveId] = useState('1');
  const styles = useThemedStyles(t => ({
    link: { ...t.type.label, color: t.roles.accentPrimary },
  }));

  const accounts = ACCOUNTS.slice(0, count);
  const active = accounts.find(a => a.id === activeId);

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={styles.link}>Open the Accounts sheet</Text>
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Accounts on this device"
      >
        {accounts.map(a => (
          <ListRow
            key={a.id}
            leading={<Avatar initials={a.initials} />}
            title={a.name}
            subtitle={a.email}
            trailing={
              a.id === activeId ? (
                <Check size={controlSizes.icon24} color={roles.accentPrimary} />
              ) : null
            }
            selected={a.id === activeId}
            accessibilityLabel={
              a.id === activeId ? `${a.name}, signed in` : `Switch to ${a.name}`
            }
            onPress={() => setActiveId(a.id)}
          />
        ))}
        <ListRow
          icon={UserPlus}
          title="Add account"
          subtitle={`${count} of ${MAX_DEVICE_ACCOUNTS} on this device`}
          disabled={count >= MAX_DEVICE_ACCOUNTS}
          onPress={() => setCount(c => c + 1)}
        />
        <ListRow
          icon={Gear}
          title="Settings"
          trailing="chevron"
          onPress={() => setOpen(false)}
        />
        <ListRow
          title="Privacy Policy"
          trailing="chevron"
          onPress={() => setOpen(false)}
        />
        <ListRow
          title="Terms of Use"
          trailing="chevron"
          onPress={() => setOpen(false)}
        />
        <ListRow
          icon={SignOut}
          title={ACCOUNT_SIGN_OUT_LABEL}
          subtitle={active?.name}
          onPress={() => {
            setCount(1);
            setActiveId('1');
          }}
        />
      </BottomSheet>
    </View>
  );
}
