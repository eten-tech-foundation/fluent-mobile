import React from 'react';
import { useRouter } from 'expo-router';
import LoginScreen from '../../../app/tabs/LoginScreen';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';
import { hrefs } from '../../../navigation/hrefs';

export default function AddUserRoute() {
  const router = useRouter();
  const { signInAddUser } = useAuthSession();

  return (
    <LoginScreen
      legalLinksGroup="app"
      onLoginSuccess={(email: string) => {
        router.replace(hrefs.home({ newUserLoading: true }));
        signInAddUser(email);
      }}
    />
  );
}
