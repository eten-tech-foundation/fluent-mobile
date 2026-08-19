import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoginScreen from '../../../app/tabs/LoginScreen';
import { syncAllData } from '../../../services/sync';
import { getUserEmailSync } from '../../../services/storage';
import {
  REAUTH_SCREEN_SUBTITLE,
  REAUTH_SCREEN_TITLE,
} from '../../../constants/messages';
import {
  navigateFromReauth,
  parseReauthReturnTo,
} from '../../../navigation/reauthNavigation';
import { logger } from '../../../utils/logger';

const log = logger.create('ReauthRoute');

export default function ReauthRoute() {
  const router = useRouter();
  const { returnTo: returnToParam } = useLocalSearchParams<{
    returnTo?: string | string[];
  }>();
  const returnTo = parseReauthReturnTo(returnToParam);

  const handleGoBack = useCallback(() => {
    navigateFromReauth(router, returnTo);
  }, [router, returnTo]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleGoBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [handleGoBack]);

  return (
    <LoginScreen
      variant="reauth"
      initialEmail={getUserEmailSync()}
      title={REAUTH_SCREEN_TITLE}
      subtitle={REAUTH_SCREEN_SUBTITLE}
      onLoginSuccess={() => {
        syncAllData(true).catch(error => {
          log.error('Post-reauth sync failed', { error: String(error) });
        });
        navigateFromReauth(router, returnTo);
      }}
    />
  );
}
