import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation/types';
import HomeScreen from '../app/screens/HomeScreen';
import SettingsScreen from '../app/screens/SettingsScreen';
import PrepareForOfflineScreen from '../app/screens/PrepareForOfflineScreen';
import ViewProject from '../app/tabs/ViewProject';
import ViewChapter from '../app/tabs/ViewChapter';
import LoginScreen from '../app/tabs/LoginScreen';
import PrivacyPolicyScreen from '../app/tabs/PrivacyPolicyPage';
import TermsOfUseScreen from '../app/tabs/TermsOfUsePage';
import { syncAllData } from '../services/sync';

const Stack = createStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  isAuthenticated: boolean;
  onLoginSuccess: (email: string) => void;
  onSignOut: () => void;
}

export default function AppNavigator({
  isAuthenticated,
  onLoginSuccess,
  onSignOut,
}: AppNavigatorProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login">
            {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
          </Stack.Screen>
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="TermsOfUse" component={TermsOfUseScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Settings">
            {() => <SettingsScreen onSignOut={onSignOut} />}
          </Stack.Screen>
          <Stack.Screen
            name="PrepareForOffline"
            component={PrepareForOfflineScreen}
          />
          <Stack.Screen name="Chapters" component={ViewProject} />
          <Stack.Screen name="VerseDetail" component={ViewChapter} />
          <Stack.Screen name="AddUser">
            {({ navigation }) => (
              <LoginScreen
                onLoginSuccess={(email: string) => {
                  navigation.navigate('Home', { newUserLoading: true });
                  syncAllData(false, email).catch(() => {});
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="TermsOfUse" component={TermsOfUseScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
