import React, { useState, useEffect, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { syncAllData } from '../../services/sync';
import {
  getSyncState,
  getSyncError,
  KV_KEYS,
  getUserEmailSync,
} from '../../services/storage';
import { logger } from '../../utils/logger';

const log = logger.create('SyncButton');

type SyncStateType = 'normal' | 'syncing' | 'never' | 'error';

interface SyncButtonProps {
  onSyncComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  onSyncStart?: () => void;
}

export function SyncButton({
  onSyncComplete,
  style,
  onSyncStart,
}: SyncButtonProps) {
  const [stateType, setStateType] = useState<SyncStateType>('normal');
  const [displayText, setDisplayText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const getRelativeTime = (isoTimestamp: string | undefined): string => {
    if (!isoTimestamp) return 'Never synced';

    const now = new Date();
    const syncTime = new Date(isoTimestamp);
    const diffMs = now.getTime() - syncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getFailedStep = (): string | null => {
    const projectsError = getSyncError(KV_KEYS.SYNC_ERROR_PROJECTS);
    if (projectsError) return 'projects';

    const chaptersError = getSyncError(KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS);
    if (chaptersError) return 'chapter assignments';

    const projectUnitsError = getSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
    if (projectUnitsError) return 'project units';

    const bibleTextsError = getSyncError(KV_KEYS.SYNC_ERROR_BIBLE_TEXTS);
    if (bibleTextsError) return 'bible texts';

    return null;
  };

  const updateState = useCallback(() => {
    if (isSyncing) {
      setStateType('syncing');
      setDisplayText('Syncing...');
    } else {
      const failedStep = getFailedStep();
      const syncState = getSyncState();

      if (failedStep) {
        setStateType('error');
        setDisplayText(`Sync failed: ${failedStep}`);
      } else if (!syncState.lastSyncedAt) {
        setStateType('never');
        setDisplayText('Never synced');
      } else {
        setStateType('normal');
        setDisplayText(
          `Last synced: ${getRelativeTime(syncState.lastSyncedAt)}`,
        );
      }
    }
  }, [isSyncing]);

  useEffect(() => {
    updateState();
  }, [isSyncing, updateState]);

  useEffect(() => {
    if (stateType === 'normal') {
      const interval = setInterval(() => {
        updateState();
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [stateType, updateState]);

  const handleSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      onSyncStart?.();
      const email = getUserEmailSync();

      if (!email) {
        log.error('No user email found for sync');
        setIsSyncing(false);
        return;
      }

      log.info('Triggering sync...');
      await syncAllData(email);

      log.info('Sync completed successfully');
      updateState();
      onSyncComplete?.();
    } catch (error) {
      log.error('Sync failed', { error });
      updateState();
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncStart, onSyncComplete, updateState]);

  const getStateColors = () => {
    switch (stateType) {
      case 'syncing':
        return {
          backgroundColor: '#e6f1fb',
          borderColor: '#b5d4f4',
          textColor: '#1a6ef5',
        };
      case 'error':
        return {
          backgroundColor: '#fcebeb',
          borderColor: '#f7c1c1',
          textColor: '#d32f2f',
        };
      case 'never':
      case 'normal':
      default:
        return {
          backgroundColor: '#fff',
          borderColor: '#e0e0e0',
          textColor: '#999',
        };
    }
  };

  const colors = getStateColors();

  return (
    <View
      style={[
        styles.container,
        style,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.text, { color: colors.textColor }]}>
          {displayText}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSync}
        disabled={isSyncing}
        activeOpacity={0.7}
        style={styles.syncButton}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={colors.textColor} />
        ) : (
          <Ionicons name="refresh" size={20} color={colors.textColor} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
  syncButton: {
    padding: 8,
    marginLeft: 12,
  },
});
