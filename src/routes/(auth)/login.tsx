import React from 'react';
import LoginScreen from '../../app/tabs/LoginScreen';
import { useAuthSession } from '../../navigation/AuthSessionProvider';

export default function LoginRoute() {
  const { signIn } = useAuthSession();
  return <LoginScreen onLoginSuccess={signIn} />;
}
