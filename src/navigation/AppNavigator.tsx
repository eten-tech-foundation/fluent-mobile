import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './types';
import ProjectList from '../screens/main/ProjectList';
import ViewProject from '../screens/main/ViewProject';
import VerseDetailScreen from '../screens/main/ViewChapter';

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Projects" component={ProjectList} />
      <Stack.Screen name="Chapters" component={ViewProject} />
      <Stack.Screen name="VerseDetail" component={VerseDetailScreen} />
    </Stack.Navigator>
  );
}
