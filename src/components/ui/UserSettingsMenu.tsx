import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { theme } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { UserPlus } from 'lucide-react-native';
import { appStyles } from '../../app/appStyles';
import { RootStackParamList } from '../../types/navigation/types';
import { getActiveUserId } from '../../services/storage';
import {
  signOutCurrentDeviceAccount,
  switchToDeviceAccount,
} from '../../services/accountSession';
import { useDeviceAccounts } from '../../hooks/useDeviceAccounts';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

const MENU_ICON_COLOR = '#333';
const MENU_ICON_ACTIVE = '#1a6ef5';

const OPEN_ANIM_DURATION = 250;
const CLOSE_ANIM_DURATION = 200;
const SWIPE_CLOSE_RATIO = 0.3;
const SWIPE_VELOCITY_THRESHOLD = 800;

const log = logger.create('UserSettingsMenu');

type Nav = StackNavigationProp<RootStackParamList>;

interface UserSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  onSignOut?: () => void;
  onUserSwitched?: () => void;
}

export function UserSettingsMenu({
  visible,
  onClose,
  onSignOut,
  onUserSwitched,
}: UserSettingsMenuProps) {
  const navigation = useNavigation<Nav>();
  const { accounts, hasAccountLimit, loading } = useDeviceAccounts(visible);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const panelWidth = useMemo(
    () => Math.min(320, windowWidth * 0.82),
    [windowWidth],
  );

  const panelInsetStyle = useMemo(
    () => ({
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    }),
    [insets.top, insets.bottom],
  );

  const translateX = useRef(new Animated.Value(-panelWidth)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);

  const isMountedRef = useRef(isMounted);
  const animationGenerationRef = useRef(0);

  const startOpeningAnimation = useCallback(() => {
    translateX.stopAnimation();
    scrimOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: OPEN_ANIM_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 1,
        duration: OPEN_ANIM_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateX, scrimOpacity]);

  useEffect(() => {
    const wasMounted = isMountedRef.current;
    animationGenerationRef.current += 1;
    const generation = animationGenerationRef.current;

    if (visible) {
      setIsMounted(true);
      isMountedRef.current = true;
      if (wasMounted) {
        startOpeningAnimation();
        return;
      }

      translateX.setValue(-panelWidth);
      scrimOpacity.setValue(0);
    } else if (wasMounted) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -panelWidth,
          duration: CLOSE_ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: CLOSE_ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && animationGenerationRef.current === generation) {
          setIsMounted(false);
          isMountedRef.current = false;
        }
      });
    }
  }, [visible, panelWidth, startOpeningAnimation, translateX, scrimOpacity]);

  const panGesture = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY([-15, 15])
    .onUpdate(event => {
      const next = Math.min(0, event.translationX);
      translateX.setValue(next);
      scrimOpacity.setValue(1 - Math.min(1, Math.abs(next) / panelWidth));
    })
    .onEnd(event => {
      const shouldClose =
        event.translationX < -panelWidth * SWIPE_CLOSE_RATIO ||
        event.velocityX < -SWIPE_VELOCITY_THRESHOLD;

      if (shouldClose) {
        onClose();
      } else {
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }),
          Animated.timing(scrimOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });

  const handleOpenSettings = () => {
    onClose();
    navigation.navigate('Settings');
  };

  const handleAddUser = () => {
    if (hasAccountLimit) return;
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
    if (userId === getActiveUserId() || switchingUserId) {
      onClose();
      return;
    }

    setSwitchingUserId(userId);
    try {
      await switchToDeviceAccount(userId);
      onClose();
      onUserSwitched?.();
    } catch (error) {
      log.error('Account switch failed', { userId, error });
      onClose();
      Alert.alert(
        'Switch Failed',
        "Couldn't switch to that account. Its saved session may be corrupted — try adding it again.",
      );
    } finally {
      setSwitchingUserId(null);
    }
  };

  const handleSignOut = async () => {
    onClose();
    const result = await signOutCurrentDeviceAccount();
    if (result.kind === 'switched') {
      onUserSwitched?.();
      return;
    }
    onSignOut?.();
  };

  return (
    <Modal
      transparent
      visible={isMounted}
      animationType="none"
      onRequestClose={onClose}
      onShow={startOpeningAnimation}
    >
      <GestureHandlerRootView style={styles.container}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.panel,
              panelInsetStyle,
              { width: panelWidth, transform: [{ translateX }] },
            ]}
          >
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.panelContent}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={appStyles.menuItem}
                onPress={handleOpenSettings}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Ionicons
                  name="settings-outline"
                  size={18}
                  color={MENU_ICON_COLOR}
                />
                <Text style={appStyles.menuItemText}>More Settings</Text>
              </TouchableOpacity>

              <View style={[appStyles.menuDivider, styles.panelDivider]} />

              <TouchableOpacity
                style={appStyles.menuItem}
                onPress={handleOpenPrivacy}
                activeOpacity={0.7}
                accessibilityRole="button"
                testID="settings-menu-privacy-policy"
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={MENU_ICON_COLOR}
                />
                <Text style={appStyles.menuItemText}>Privacy Policy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={appStyles.menuItem}
                onPress={handleOpenTerms}
                activeOpacity={0.7}
                accessibilityRole="button"
                testID="settings-menu-terms-of-use"
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={MENU_ICON_COLOR}
                />
                <Text style={appStyles.menuItemText}>Terms of Use</Text>
              </TouchableOpacity>

              <View style={[appStyles.menuDivider, styles.panelDivider]} />
              <Text style={appStyles.menuSectionLabel}>Accounts</Text>

              {loading ? (
                <View
                  style={styles.loadingRow}
                  testID="settings-menu-accounts-loading"
                >
                  <ActivityIndicator size="small" color={MENU_ICON_ACTIVE} />
                </View>
              ) : (
                accounts.map(account => {
                  // Mockup (#193) labels accounts by email; fall back to displayName.
                  const accountLabel = account.email || account.displayName;
                  return (
                    <TouchableOpacity
                      key={account.userId}
                      style={appStyles.menuItem}
                      onPress={() => {
                        void handleSwitchUser(account.userId);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Switch to ${accountLabel}`}
                      accessibilityState={{ selected: account.isActive }}
                      disabled={switchingUserId !== null}
                      testID={`settings-menu-account-${account.userId}`}
                    >
                      <Ionicons
                        name={
                          account.isActive
                            ? 'checkmark-circle'
                            : 'person-outline'
                        }
                        size={18}
                        color={
                          account.isActive ? MENU_ICON_ACTIVE : MENU_ICON_COLOR
                        }
                        testID={
                          account.isActive
                            ? `settings-menu-active-${account.userId}`
                            : `settings-menu-inactive-${account.userId}`
                        }
                      />
                      <Text
                        style={[
                          appStyles.menuItemText,
                          account.isActive && appStyles.menuItemActive,
                        ]}
                        numberOfLines={1}
                      >
                        {accountLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}

              {hasAccountLimit ? (
                <Text
                  style={styles.limitText}
                  testID="settings-menu-account-limit"
                >
                  You&apos;ve reached the 3-account limit.
                </Text>
              ) : (
                <TouchableOpacity
                  style={appStyles.menuItem}
                  onPress={handleAddUser}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add User"
                  testID="settings-menu-add-user"
                >
                  <UserPlus size={18} color={MENU_ICON_COLOR} />
                  <Text style={appStyles.menuItemText}>Add User</Text>
                </TouchableOpacity>
              )}

              <View style={[appStyles.menuDivider, styles.panelDivider]} />
              <TouchableOpacity
                style={appStyles.menuItem}
                onPress={() => {
                  void handleSignOut();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={18} color="#d32f2f" />
                <Text
                  style={[appStyles.menuItemText, appStyles.menuItemDanger]}
                >
                  Sign Out
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.cardBackground,
    ...theme.shadows.elevated,
  },
  scrollArea: {
    flex: 1,
  },
  panelContent: {
    paddingTop: 24,
  },
  panelDivider: {
    backgroundColor: theme.colors.border,
  },
  loadingRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  limitText: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});
