import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { logger } from '../../utils/logger';
import { Project } from '../../types/db/types';
import { getProjects } from '../../db/queries';
import { appStyles } from '../appStyles';
import { useNavigation } from '@react-navigation/native';
import { SyncButton } from '../../components/ui/SyncButton';
import FluentLogo from '../../assets/icons/fluent-logo.svg';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { RootStackParamList } from '../../types/navigation/types';

import {
  getUserIdSync,
  getKnownUserIds,
  getUserEmail,
  switchActiveUser,
  getActiveUserId,
  kvStorage,
  KV_KEYS,
} from '../../services/storage';
import { onSyncComplete, onSyncStart } from '../../services/syncEvents';
import { clearCredentials, getCredentials } from '../../services/keychain';
import { FluentAPI, setActiveToken } from '../../services/api';

const log = logger.create('ProjectList');
type Nav = StackNavigationProp<RootStackParamList, 'Projects'>;

interface ProjectListProps {
  onSignOut?: () => void;
}

export default function ProjectList({ onSignOut }: ProjectListProps) {
  const navigation = useNavigation<Nav>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [knownUsers, setKnownUsers] = useState<
    Array<{ id: string; email: string }>
  >([]);
  const gearRef = useRef<React.ComponentRef<typeof TouchableOpacity>>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const route = useRoute<RouteProp<RootStackParamList, 'Projects'>>();

  const [isNewUserLoading, setIsNewUserLoading] = useState(
    () => route.params?.newUserLoading === true,
  );

  const loadProjects = useCallback(async () => {
    try {
      const userId = Number(getUserIdSync());
      log.info('Loading projects for userId', { userId });
      const data = await getProjects(userId);
      log.info('Projects loaded', { count: data.length });
      setProjects(data);
      if (data.length > 0 || syncCompleted) {
        setLoading(false);
      }
    } catch (error) {
      log.error('Error loading projects:', { error });
      setLoading(false);
    }
  }, [syncCompleted]);

  useEffect(() => {
    loadProjects();

    const unsubscribeComplete = onSyncComplete(() => {
      setIsNewUserLoading(false); // ← clear the flag when sync finishes
      setSyncCompleted(true);
      setIsSyncing(false);
      loadProjects();
    });

    const unsubscribeStart = onSyncStart(() => {
      setIsSyncing(true);
    });

    return () => {
      unsubscribeComplete();
      unsubscribeStart();
    };
  }, [loadProjects]);

  const loadKnownUsers = useCallback(() => {
    const ids = getKnownUserIds();
    const users = ids.map(id => ({ id, email: getUserEmail(id) }));
    setKnownUsers(users);
  }, []);

  const handleGearPress = () => {
    loadKnownUsers();
    gearRef.current?.measure(
      (
        _x: number,
        _y: number,
        _w: number,
        h: number,
        _px: number,
        py: number,
      ) => {
        setMenuPosition({ top: py + h + 4, right: 16 });
        setMenuVisible(true);
      },
    );
  };

  const handleAddUser = () => {
    setMenuVisible(false);
    navigation.navigate('AddUser');
  };

  const handleSwitchUser = async (userId: string) => {
    setMenuVisible(false);
    if (userId === getActiveUserId()) return;
    log.info('Switching to userId:', { userId });

    const creds = await getCredentials(userId);
    log.info('Creds found', {
      hasCreds: !!creds,
      token: creds?.token?.slice(0, 15),
    });

    setActiveToken(creds?.token ?? null);
    log.info('Token set, switching active user');

    switchActiveUser(userId);
    setLoading(true);
    setSyncCompleted(false);
    await loadProjects();
    setLoading(false);
  };

  const handleSignOut = async () => {
    setMenuVisible(false);
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
      loadKnownUsers();
      setLoading(true);
      setSyncCompleted(false);
      await loadProjects();
      setLoading(false);
    } else {
      setActiveToken(null);
      kvStorage.removeItemSync(KV_KEYS.ACTIVE_USER_ID);
      kvStorage.removeItemSync(KV_KEYS.USER_ID);
      kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
      onSignOut?.();
    }
  };

  const handleSyncComplete = async () => {
    log.info('Sync completed, refreshing projects list...');
    setRefreshing(true);
    try {
      await loadProjects();
    } finally {
      setRefreshing(false);
    }
  };

  const activeUserId = getActiveUserId();

  if (loading || isNewUserLoading || (isSyncing && projects.length === 0)) {
    return (
      <View style={[appStyles.container, appStyles.centered]}>
        <ActivityIndicator size="large" color="#1a6ef5" />
        <Text style={appStyles.loadingText}>
          {isSyncing ? 'Syncing data...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={appStyles.container}>
      <View style={appStyles.screenHeader}>
        <FluentLogo width={160} height={54} />
        <TouchableOpacity
          ref={gearRef}
          onPress={handleGearPress}
          style={appStyles.gearButton}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={24} color="#555" />
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={appStyles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View
            style={[
              appStyles.dropdown,
              { top: menuPosition.top, right: menuPosition.right },
            ]}
          >
            <TouchableOpacity
              style={appStyles.menuItem}
              onPress={handleAddUser}
              activeOpacity={0.7}
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
            >
              <Ionicons name="log-out-outline" size={18} color="#d32f2f" />
              <Text style={[appStyles.menuItemText, appStyles.menuItemDanger]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <SyncButton
        onSyncComplete={handleSyncComplete}
        onSyncStart={() => setIsSyncing(true)}
      />

      <View style={appStyles.sectionHeader}>
        <Ionicons name="folder-outline" size={24} color="#000" />
        <Text style={appStyles.sectionHeaderText}>Projects</Text>
      </View>

      {projects.length === 0 ? (
        <View style={[appStyles.container, appStyles.centered]}>
          <Ionicons name="folder-open-outline" size={48} color="#ccc" />
          <Text style={appStyles.emptyText}>No projects found</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={appStyles.listContent}
          refreshing={refreshing}
          onRefresh={handleSyncComplete}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={appStyles.cardRow}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate('Chapters', {
                  projectId: item.id,
                  projectName: item.name,
                  language: item.target_language_name,
                })
              }
            >
              <Ionicons name="folder-outline" size={24} color="#000" />
              <View style={appStyles.cardText}>
                <Text style={appStyles.cardTitle}>{item.name}</Text>
                <Text style={appStyles.cardSubtitle}>
                  {item.target_language_name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#000" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
