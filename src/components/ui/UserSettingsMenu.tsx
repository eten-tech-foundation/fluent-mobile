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
import { FluentAPI } from '../../services/api';
import { signOut } from '../../services/authSession';
import { authToken } from '../../services/authToken';
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

  const atAccountLimit = knownUsers.length >= 3;

  const handleOpen = () => {
    loadKnownUsers();
  };

  const handleOpenSettings = () => {
    onClose();
    navigation.navigate('Settings');
  };

  const handleAddUser = () => {
    if (atAccountLimit) return;
    onClose();
    navigation.navigate('AddUser');
  };

  const handleOpenPrivacy = () => {
    onClose();
    navigation.navigate('PrivacyPolicy');
  };

  const handleOpenTerms = () => {
    onClose();
    navigation.navigate('TermsOfUse');
  };

  const handleSwitchUser = async (userId: string) => {
    onClose();
    if (userId === getActiveUserId()) return;

    const creds = await getCredentials(userId);
    authToken.set(creds?.token ?? null);
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
      authToken.set(creds?.token ?? null);
      switchActiveUser(nextUserId);
      onUserSwitched?.();
    } else {
      signOut();
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
            <Text style={appStyles.menuItemText}>More Settings</Text>
          </TouchableOpacity>

          <View style={appStyles.menuDivider} />
          <TouchableOpacity
            style={[
              appStyles.menuItem,
              atAccountLimit && appStyles.menuItemDisabled,
            ]}
            onPress={handleAddUser}
            activeOpacity={atAccountLimit ? 1 : 0.7}
            accessibilityRole="button"
            accessibilityState={{ disabled: atAccountLimit }}
            disabled={atAccountLimit}
            testID="settings-menu-add-user"
          >
            <Ionicons
              name="person-add-outline"
              size={18}
              color={atAccountLimit ? '#999' : '#333'}
            />
            <Text
              style={[
                appStyles.menuItemText,
                atAccountLimit && appStyles.menuItemTextDisabled,
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {atAccountLimit ? '3-account limit reached' : 'Add User'}
            </Text>
          </TouchableOpacity>

          <View style={appStyles.menuDivider} />
          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenPrivacy}
            activeOpacity={0.7}
            accessibilityRole="button"
            testID="settings-menu-privacy-policy"
          >
            <Ionicons name="document-text-outline" size={18} color="#333" />
            <Text style={appStyles.menuItemText}>Privacy Policy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={appStyles.menuItem}
            onPress={handleOpenTerms}
            activeOpacity={0.7}
            accessibilityRole="button"
            testID="settings-menu-terms-of-use"
          >
            <Ionicons name="reader-outline" size={18} color="#333" />
            <Text style={appStyles.menuItemText}>Terms of Use</Text>
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
