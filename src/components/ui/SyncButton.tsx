import React, { useState, useEffect, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import {
  // syncAllData,
  syncAllUsers,
} from '../../services/sync';
import {
  getSyncState,
  getSyncError,
  getActiveUserId,
  KV_KEYS,
  // getUserIdSync,
} from '../../services/storage';
import { getCredentials } from '../../services/keychain';
import { logger } from '../../utils/logger';
import { appStyles } from '../../app/appStyles';
import { syncPendingRecordings } from '../../services/recordingSync';

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
    const userError = getSyncError(KV_KEYS.SYNC_ERROR_USER);
    if (userError) return 'user';

    const masterDataError = getSyncError(KV_KEYS.SYNC_ERROR_MASTER_DATA);
    if (masterDataError) return 'master data';

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
      // const userId = getUserIdSync();
      // const syncState = getSyncState(userId || undefined);
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

      const activeUserId = getActiveUserId();
      const creds = await getCredentials(activeUserId);
      if (creds?.token) {
        try {
          const uploadResult = await syncPendingRecordings(creds.token);
          log.info('Recording upload finished', { ...uploadResult });
        } catch (uploadError) {
          log.error('Recording upload failed', { error: uploadError });
        }
      } else {
        log.warn('No credentials for active user, skipping recording upload');
      }

      await syncAllUsers();
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
        appStyles.syncContainer,
        style,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
    >
      <View style={appStyles.syncContent}>
        <Text style={[appStyles.syncText, { color: colors.textColor }]}>
          {displayText}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSync}
        disabled={isSyncing}
        activeOpacity={0.7}
        style={appStyles.syncRefreshBtn}
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
