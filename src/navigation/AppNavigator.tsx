import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigation/types';
import HomeScreen from '../app/screens/HomeScreen';
import ViewProject from '../app/tabs/ViewProject';
import ViewChapter from '../app/tabs/ViewChapter';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Chapters" component={ViewProject} />
      <Stack.Screen name="VerseDetail" component={ViewChapter} />
    </Stack.Navigator>
  );
}
