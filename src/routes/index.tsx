import { Redirect } from 'expo-router';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import {
  APP_HOME_HREF,
  AUTH_LOGIN_HREF,
  getAuthGateDecision,
} from '../navigation/authGate';

/** `/` entry — wait for session, then send users to the correct group. */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuthSession();
  const decision = getAuthGateDecision({
    isLoading,
    isAuthenticated,
    inAuthGroup: false,
    inAppGroup: false,
  });
  if (decision.action === 'wait') return null;
  return <Redirect href={isAuthenticated ? APP_HOME_HREF : AUTH_LOGIN_HREF} />;
}
