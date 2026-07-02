import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation/types';
import HomeScreen from '../app/screens/HomeScreen';
import SettingsScreen from '../app/screens/SettingsScreen';
import PrepareForOfflineScreen from '../app/screens/PrepareForOfflineScreen';
import ViewProject from '../app/tabs/ViewProject';
import DraftingPage from '../app/tabs/drafting/DraftingPage';
import LoginScreen from '../app/tabs/LoginScreen';
import ForgotPasswordScreen from '../app/tabs/ForgotPasswordScreen';
import PrivacyPolicyScreen from '../app/tabs/PrivacyPolicyPage';
import TermsOfUseScreen from '../app/tabs/TermsOfUsePage';

const Stack = createStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  isAuthenticated: boolean;
  onLoginSuccess: (email: string) => void;
  onAddUserLoginSuccess: (email: string) => void;
  onSignOut: () => void;
  postLoginSyncActive?: boolean;
}

export default function AppNavigator({
  isAuthenticated,
  onLoginSuccess,
  onAddUserLoginSuccess,
  onSignOut,
  postLoginSyncActive = false,
}: AppNavigatorProps) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login">
            {() => <LoginScreen onLoginSuccess={onLoginSuccess} />}
          </Stack.Screen>
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="TermsOfUse" component={TermsOfUseScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Home">
            {() => (
              <HomeScreen
                onSignOut={onSignOut}
                postLoginSyncActive={postLoginSyncActive}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {() => <SettingsScreen onSignOut={onSignOut} />}
          </Stack.Screen>
          <Stack.Screen
            name="PrepareForOffline"
            component={PrepareForOfflineScreen}
          />
          <Stack.Screen name="Chapters" component={ViewProject} />
          <Stack.Screen name="VerseDetail" component={DraftingPage} />
          <Stack.Screen name="AddUser">
            {({ navigation }) => (
              <LoginScreen
                onLoginSuccess={(email: string) => {
                  navigation.navigate('Home', { newUserLoading: true });
                  onAddUserLoginSuccess(email);
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="TermsOfUse" component={TermsOfUseScreen} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
