import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { appStyles } from '../../app/appStyles';
import { RootStackParamList } from '../../types/navigation/types';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
  kvStorage,
  KV_KEYS,
  switchActiveUser,
} from '../../services/storage';
import { clearCredentials, getCredentials } from '../../services/keychain';
import { FluentAPI, setActiveToken } from '../../services/api';
import { logger } from '../../utils/logger';

const log = logger.create('UserSettingsMenu');

type Nav = StackNavigationProp<RootStackParamList>;

interface UserSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  anchor: { top: number; left: number };
  onSignOut?: () => void;
  onUserSwitched?: () => void;
}

export function UserSettingsMenu({
  visible,
  onClose,
  anchor,
  onSignOut,
  onUserSwitched,
}: UserSettingsMenuProps) {
  const navigation = useNavigation<Nav>();
  const [knownUsers, setKnownUsers] = useState<
    Array<{ id: string; email: string }>
  >([]);

  const loadKnownUsers = useCallback(() => {
    const ids = getKnownUserIds();
    setKnownUsers(ids.map(id => ({ id, email: getUserEmail(id) })));
  }, []);

  const handleOpen = () => {
    loadKnownUsers();
  };

  const handleOpenSettings = () => {
    onClose();
    navigation.navigate('Settings');
  };

  const handleAddUser = () => {
    onClose();
    navigation.navigate('AddUser');
  };

  const handleSwitchUser = async (userId: string) => {
    onClose();
    if (userId === getActiveUserId()) return;

    const creds = await getCredentials(userId);
    setActiveToken(creds?.token ?? null);
    switchActiveUser(userId);
    onUserSwitched?.();
  };

  const handleSignOut = async () => {
    onClose();
    const currentUserId = getActiveUserId();

    try {
      await FluentAPI.signOut();
    } catch (e) {
      log.error('Server sign out failed', { error: e });
    }

    await clearCredentials(currentUserId);

    const remaining = getKnownUserIds().filter(id => id !== currentUserId);
    kvStorage.setItemSync(KV_KEYS.KNOWN_USER_IDS, remaining.join(','));
    log.info('User signed out', { userId: currentUserId });

    if (remaining.length > 0) {
      const nextUserId = remaining[0];
      const creds = await getCredentials(nextUserId);
      setActiveToken(creds?.token ?? null);
      switchActiveUser(nextUserId);
      onUserSwitched?.();
    } else {
      setActiveToken(null);
      kvStorage.removeItemSync(KV_KEYS.ACTIVE_USER_ID);
      kvStorage.removeItemSync(KV_KEYS.USER_ID);
      kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
      onSignOut?.();
    }
  };

  const activeUserId = getActiveUserId();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <Pressable style={appStyles.modalOverlay} onPress={onClose}>
        <View
          style={[appStyles.dropdown, { top: anchor.top, left: anchor.left }]}
        >
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenSettings}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={18} color="#333" />
            <Text style={appStyles.menuItemText}>Settings</Text>
          </TouchableOpacity>

          <View style={appStyles.menuDivider} />
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleAddUser}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons name="person-add-outline" size={18} color="#333" />
            <Text style={appStyles.menuItemText}>Add User</Text>
          </TouchableOpacity>

          {knownUsers.length > 1 && (
            <>
              <View style={appStyles.menuDivider} />
              <Text style={appStyles.menuSectionLabel}>Switch User</Text>
              {knownUsers.map(user => (
                <TouchableOpacity
                  key={user.id}
                  style={appStyles.menuItem}
                  onPress={() => handleSwitchUser(user.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={
                      user.id === activeUserId
                        ? 'checkmark-circle'
                        : 'person-outline'
                    }
                    size={18}
                    color={user.id === activeUserId ? '#1a6ef5' : '#333'}
                  />
                  <Text
                    style={[
                      appStyles.menuItemText,
                      user.id === activeUserId && appStyles.menuItemActive,
                    ]}
                    numberOfLines={1}
                  >
                    {user.email || `User ${user.id}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={appStyles.menuDivider} />
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleSignOut}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={18} color="#d32f2f" />
            <Text style={[appStyles.menuItemText, appStyles.menuItemDanger]}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}
