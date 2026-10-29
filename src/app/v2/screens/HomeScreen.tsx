import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AVATAR_SIZE, Avatar } from '../../../components/ui/Avatar';
import { Banner } from '../../../components/ui/Banner';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { HOME_EMPTY_MESSAGE } from '../../../constants/messages';
import { useActiveAccountSummary } from '../../../hooks/useActiveAccountSummary';
import { useHomeBooks } from '../../../hooks/useHomeBooks';
import { useHomeSyncState } from '../../../hooks/useHomeSyncState';
import { useMyWorkChapters } from '../../../hooks/useMyWorkChapters';
import { useNextUp } from '../../../hooks/useNextUp';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';
import { hrefs } from '../../../navigation/hrefs';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';
import type { HomeBookSummary, MyWorkChapter } from '../../../types/db/types';
import {
  getAccountDisplayName,
  getAccountInitials,
} from '../../../utils/accountDisplay';
import type { SyncStatus } from '../../../utils/syncStatusState';
import { AccountsSheet } from './home/AccountsSheet';
import { Books } from './home/Books';
import { ChangesRequested } from './home/ChangesRequested';
import { NextUp } from './home/NextUp';

const SYNC_SUMMARY: Record<SyncStatus, string> = {
  online_synced: 'All synced',
  online_syncing: 'Syncing',
  online_uploading: 'Syncing',
  online_pending: 'Upload pending',
  online_needs_sync: 'Updates available',
  online_failed: 'Upload failed',
  offline_synced: 'Offline',
  offline_pending: 'Offline · upload pending',
};

/**
 * Next Home, in place of Legacy's My Work and Milestones tabs: a card when
 * a chapter comes back with changes to make (a dev-only sample for now), the
 * passage to record next and the few after it, then every book in my
 * milestones. Work with others shows only as counts on the books.
 */
export default function HomeScreen() {
  const { postLoginSyncActive, userSwitchEpoch } = useAuthSession();
  return (
    <HomeBody
      key={userSwitchEpoch}
      postLoginSyncActive={postLoginSyncActive}
      userSwitchEpoch={userSwitchEpoch}
    />
  );
}

function HomeBody({
  postLoginSyncActive,
  userSwitchEpoch,
}: {
  postLoginSyncActive: boolean;
  userSwitchEpoch: number;
}) {
  const router = useRouter();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    refreshKey,
    showLoading,
    isSyncingChapters,
    syncStatus,
    failedErrorText,
    reauthRequired,
  } = useHomeSyncState({ postLoginSyncActive, userSwitchEpoch });
  const account = useActiveAccountSummary(userSwitchEpoch);
  const { chapters, loading, refresh } = useMyWorkChapters(refreshKey);
  const {
    books,
    loading: booksLoading,
    refresh: refreshBooks,
  } = useHomeBooks(refreshKey);
  const nextUp = useNextUp(chapters);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshBooks()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshBooks]);

  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    content: { flexGrow: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.lg,
    },
    avatarSlot: { width: AVATAR_SIZE, height: AVATAR_SIZE },
    banner: { marginHorizontal: t.spacing.lg, marginTop: t.spacing.lg },
    heading: {
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.xxl,
      paddingBottom: t.spacing.sm,
      gap: t.spacing.xs,
    },
    title: { ...t.type.heading, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      gap: t.spacing.md,
    },
    message: {
      ...t.type.body,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
  }));

  const openAccounts = useCallback(() => setAccountsOpen(true), []);
  const closeAccounts = useCallback(() => setAccountsOpen(false), []);
  const signInAgain = useCallback(() => {
    router.push(hrefs.reauth({ returnTo: 'home' }));
  }, [router]);
  const openPassage = useCallback(
    (chapter: MyWorkChapter, anchorVerse: number) =>
      router.push(
        hrefs.passage({
          chapterId: chapter.id,
          anchorVerse,
          projectId: chapter.projectId,
          projectUnitId: chapter.projectUnitId,
          chapterName: chapter.displayLabel,
          projectName: chapter.projectName,
          milestoneName: chapter.milestoneName,
          language: chapter.targetLanguageName,
        }),
      ),
    [router],
  );
  const openBook = useCallback(
    (book: HomeBookSummary) =>
      router.push(
        hrefs.chapters({
          projectId: book.projectId,
          projectUnitId: book.projectUnitId,
          projectName: book.projectName,
          milestoneName: book.milestoneName,
          language: book.targetLanguageName,
          focusChapterId: book.firstChapterId,
        }),
      ),
    [router],
  );

  if (showLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.centered} testID="home-loading">
          <ActivityIndicator size="large" color={theme.roles.accentPrimary} />
          <Text style={styles.message}>Syncing…</Text>
        </View>
      </View>
    );
  }

  const name = {
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
  };
  const chaptersLabel = `${chapters.length} ${
    chapters.length === 1 ? 'chapter' : 'chapters'
  }`;
  // Both list hooks go back to loading on every refreshKey bump, so only the
  // first load waits.
  const listsLoading = loading || booksLoading;
  if (!loadedOnce && !listsLoading) setLoadedOnce(true);
  const waitingForChapters =
    (listsLoading && !loadedOnce) || (isSyncingChapters && !chapters.length);

  let body: React.ReactNode;
  if (waitingForChapters) {
    body = (
      <View style={styles.centered} testID="home-chapters-loading">
        <ActivityIndicator size="large" color={theme.roles.accentPrimary} />
      </View>
    );
  } else if (chapters.length === 0 && books.length === 0) {
    body = (
      <View style={styles.centered} testID="home-empty">
        <Text style={styles.message}>{HOME_EMPTY_MESSAGE}</Text>
      </View>
    );
  } else {
    body = (
      <>
        <ChangesRequested chapters={chapters} onOpen={openPassage} />
        <NextUp
          nextUp={nextUp}
          onOpen={({ chapter, passage }) =>
            openPassage(chapter, passage.anchorVerse)
          }
        />
        <Books books={books} onOpen={openBook} />
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing.xxl + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={pullToRefresh}
            colors={[theme.roles.accentPrimary]}
          />
        }
      >
        <View style={styles.header}>
          {account.activeUserId ? (
            <Avatar
              initials={getAccountInitials(name)}
              accessibilityLabel={`${getAccountDisplayName(name)}. Accounts`}
              onPress={openAccounts}
              testID="home-account"
            />
          ) : (
            <View style={styles.avatarSlot} />
          )}
          <SyncStatusButton
            status={syncStatus}
            failedErrorText={failedErrorText}
            testID="home-sync"
          />
        </View>
        {reauthRequired ? (
          <Banner
            message="Session expired. Enter your password to keep syncing."
            actionLabel="Sign in"
            onAction={signInAgain}
            style={styles.banner}
            testID="home-reauth"
          />
        ) : null}
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">
            My work
          </Text>
          <Text style={styles.meta} testID="home-summary">
            {waitingForChapters
              ? SYNC_SUMMARY[syncStatus]
              : `${chaptersLabel} · ${SYNC_SUMMARY[syncStatus]}`}
          </Text>
        </View>
        {body}
      </ScrollView>
      <AccountsSheet visible={accountsOpen} onClose={closeAccounts} />
    </View>
  );
}
