import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types/navigationTypes';
import ProjectList from '../app/tabs/ProjectList';
import ViewProject from '../app/tabs/ViewProject';
import VerseDetailScreen from '../app/tabs/ViewChapter';

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
