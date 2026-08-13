import { Redirect } from 'expo-router';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import {
  APP_HOME_HREF,
  AUTH_LOGIN_HREF,
  getAuthGateDecision,
} from '../navigation/authGate';

/**
 * `/` entry — send users to the correct group after session restore.
 */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuthSession();
  const decision = getAuthGateDecision({
    isLoading,
    isAuthenticated,
    inAuthGroup: false,
    inAppGroup: false,
  });

  if (decision.action === 'wait') {
    return null;
  }

  // Root index is neither auth nor app group — gate returns allow; pick destination by auth.
  return <Redirect href={isAuthenticated ? APP_HOME_HREF : AUTH_LOGIN_HREF} />;
}
