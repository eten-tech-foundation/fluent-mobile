import LoginScreen from '../../../app/tabs/LoginScreen';
import { useRouter } from 'expo-router';
import { syncAllData } from '../../../services/sync';
import { getUserEmailSync } from '../../../services/storage';
import {
  REAUTH_SCREEN_SUBTITLE,
  REAUTH_SCREEN_TITLE,
} from '../../../constants/messages';
import { logger } from '../../../utils/logger';

const log = logger.create('ReauthRoute');

export default function ReauthRoute() {
  const router = useRouter();

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
        router.back();
      }}
    />
  );
}
