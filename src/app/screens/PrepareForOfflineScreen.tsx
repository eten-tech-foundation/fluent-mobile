import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { PageHeader } from '../../components/layout/PageHeader';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { RootStackParamList } from '../../types/navigation/types';
import { theme } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList, 'PrepareForOffline'>;

export default function PrepareForOfflineScreen() {
  const navigation = useNavigation<Nav>();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <PageHeader title="Prepare for Offline" onBackPress={goBack} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.body}>
            Download resources and manage device storage so you can keep working
            without a network connection.
          </Text>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  body: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    lineHeight: 22,
  },
});
