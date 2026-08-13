import React from 'react';
import HomeScreen from '../../../app/screens/HomeScreen';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';

export default function HomeRoute() {
  const { postLoginSyncActive, userSwitchEpoch } = useAuthSession();

  return (
    <HomeScreen
      key={userSwitchEpoch}
      postLoginSyncActive={postLoginSyncActive}
    />
  );
}
