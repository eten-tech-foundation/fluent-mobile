import React, { useState, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { getUserEmailSync } from '../../services/storage';
import { syncAllData } from '../../services/sync';
import { logger } from '../../utils/logger';

const log = logger.create('SyncButton');

interface SyncButtonProps {
  onSyncComplete?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SyncButton({ onSyncComplete, style }: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      const email = getUserEmailSync();

      if (!email) {
        log.error('No user email found for sync');
        return;
      }

      log.info('Triggering full sync...');
      await syncAllData(email);

      log.info('Sync completed successfully');
      onSyncComplete?.();
    } catch (error) {
      log.error('Sync failed', { error });
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncComplete]);

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[styles.button, isSyncing && styles.buttonDisabled]}
        onPress={handleSync}
        disabled={isSyncing}
        activeOpacity={0.7}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sync</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  button: {
    backgroundColor: '#1a6ef5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
