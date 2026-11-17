import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LoginScreen from '../../../app/tabs/LoginScreen';
import type { LoginSuccessMeta } from '../../../hooks/useLogin';
import type { ApiUser } from '../../../types/api/responses';
import { syncAllData } from '../../../services/sync';
import { getUserEmailSync } from '../../../services/storage';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';
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
  const { notifyUserSwitched } = useAuthSession();
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
      onLoginSuccess={(
        _email: string,
        _user?: ApiUser,
        meta?: LoginSuccessMeta,
      ) => {
        if (meta?.offline) {
          // The stored session is active again. Leave the reauth flag set
          // until an online sign-in, and don't start a sync that will 401.
          notifyUserSwitched();
        } else {
          syncAllData(true).catch(error => {
            log.error('Post-reauth sync failed', { error: String(error) });
          });
        }
        navigateFromReauth(router, returnTo);
      }}
    />
  );
}
