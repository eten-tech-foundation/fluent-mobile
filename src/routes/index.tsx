import { Redirect } from 'expo-router';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import { AUTH_LOGIN_HREF, getAuthGateDecision } from '../navigation/authGate';
import { homeHrefFor } from '../navigation/uiVersionRoutes';
import { useUiVersion } from '../theme/useTheme';

/** `/` entry — wait for session, then send users to the correct group. */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuthSession();
  const uiVersion = useUiVersion();
  const decision = getAuthGateDecision({
    isLoading,
    isAuthenticated,
    inAuthGroup: false,
    inAppGroup: false,
  });
  if (decision.action === 'wait') return null;
  return (
    <Redirect
      href={isAuthenticated ? homeHrefFor(uiVersion) : AUTH_LOGIN_HREF}
    />
  );
}
