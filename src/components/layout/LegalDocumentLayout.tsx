import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { theme } from '../../theme';
import { hrefs } from '../../navigation/hrefs';
import { StackScreenHeader } from './StackScreenHeader';

interface LegalDocumentLayoutProps {
  title: string;
  testID: string;
  children: React.ReactNode;
}

export function LegalDocumentLayout({
  title,
  testID,
  children,
}: LegalDocumentLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StackScreenHeader
        title={title}
        backTestID={`${testID}-back`}
        onBack={() => {
          if (router.canGoBack()) {
            router.back();
            return;
          }
          router.replace(hrefs.home());
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing.xl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        testID={testID}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: theme.spacing.xl,
  },
});
