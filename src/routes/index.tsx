import { Redirect } from 'expo-router';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import { APP_HOME_HREF, AUTH_LOGIN_HREF } from '../navigation/authGate';

/**
 * `/` entry — send users to the correct group after session restore.
 */
export default function Index() {
  const { isAuthenticated } = useAuthSession();
  return <Redirect href={isAuthenticated ? APP_HOME_HREF : AUTH_LOGIN_HREF} />;
}
