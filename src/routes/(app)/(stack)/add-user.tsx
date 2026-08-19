import LoginScreen from '../../../app/tabs/LoginScreen';
import { useRouter } from 'expo-router';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';
import { hrefs } from '../../../navigation/hrefs';

export default function AddUserRoute() {
  const router = useRouter();
  const { signInAddUser } = useAuthSession();
  return (
    <LoginScreen
      legalLinksGroup="app"
      variant="addAccount"
      onLoginSuccess={(email, preloadedUser) => {
        router.replace(hrefs.home({ newUserLoading: true }));
        signInAddUser(email, preloadedUser);
      }}
    />
  );
}
