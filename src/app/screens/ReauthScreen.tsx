import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { syncAllData } from '../../services/sync';
import { getUserEmailSync } from '../../services/storage';
import LoginScreen from '../tabs/LoginScreen';
import { RootStackParamList } from '../../types/navigation/types';
import {
  REAUTH_SCREEN_SUBTITLE,
  REAUTH_SCREEN_TITLE,
} from '../../constants/messages';
import { logger } from '../../utils/logger';

const log = logger.create('ReauthScreen');

type Nav = StackNavigationProp<RootStackParamList, 'Reauth'>;

export default function ReauthScreen() {
  const navigation = useNavigation<Nav>();
  const initialEmail = getUserEmailSync();

  const handleReauthSuccess = useCallback(() => {
    syncAllData(true).catch(error => {
      log.error('Post-reauth sync failed', { error: String(error) });
    });
    navigation.goBack();
  }, [navigation]);

  return (
    <LoginScreen
      onLoginSuccess={handleReauthSuccess}
      initialEmail={initialEmail}
      title={REAUTH_SCREEN_TITLE}
      subtitle={REAUTH_SCREEN_SUBTITLE}
      variant="reauth"
    />
  );
}
