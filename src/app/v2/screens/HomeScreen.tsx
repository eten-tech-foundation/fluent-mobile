import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../../components/ui/Avatar';
import { Banner } from '../../../components/ui/Banner';
import { Gear } from '../../../components/ui/icons';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader, useScrolled } from '../../../components/ui/ScreenHeader';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { HOME_EMPTY_MESSAGE } from '../../../constants/messages';
import { useActiveAccountSummary } from '../../../hooks/useActiveAccountSummary';
import { useHomeBooks } from '../../../hooks/useHomeBooks';
import { useHomeSyncState } from '../../../hooks/useHomeSyncState';
import { useMyWorkChapters } from '../../../hooks/useMyWorkChapters';
import { useNextUp } from '../../../hooks/useNextUp';
import { useAuthSession } from '../../../navigation/AuthSessionProvider';
import { resolveChapterOpen } from '../../../navigation/chapterOpen';
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
  const isFocused = useIsFocused();
  const syncPushLockRef = useRef(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const scroll = useScrolled();
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
    banner: { marginHorizontal: t.spacing.lg, marginTop: t.spacing.sm },
    heading: {
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.lg,
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
  const tapRef = useRef(0);
  // An observer only ever gets the read-only view.
  const openPassage = useCallback(
    async (chapter: MyWorkChapter, anchorVerse: number) => {
      const tap = ++tapRef.current;
      const isCurrent = () => tap === tapRef.current;
      const open = await resolveChapterOpen(
        {
          chapterId: chapter.id,
          projectId: chapter.projectId,
          assignmentStatus: chapter.assignmentStatus,
          assignedUserId: chapter.assignedUserId,
          peerCheckerId: chapter.peerCheckerId,
          hasPendingStageAdvance: chapter.hasPendingStageAdvance,
        },
        isCurrent,
      );
      if (open === null || !isCurrent()) return;
      if (open.kind === 'observer') {
        router.push(open.href);
        return;
      }
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
      );
    },
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
          focusChapterId: book.firstChapterId ?? undefined,
        }),
      ),
    [router],
  );

  useEffect(() => {
    if (isFocused) syncPushLockRef.current = false;
  }, [isFocused]);

  // Home already watches sync for the empty state, so the cloud keeps this
  // lock instead of a second useHeaderSync subscription.
  const openSync = useCallback(() => {
    if (syncPushLockRef.current) return;
    syncPushLockRef.current = true;
    try {
      router.push(hrefs.sync);
    } catch {
      syncPushLockRef.current = false;
    }
  }, [router]);

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
  if (showLoading) {
    body = (
      <View style={styles.centered} testID="home-loading">
        <ActivityIndicator size="large" color={theme.roles.accentPrimary} />
        <Text style={styles.message}>Syncing…</Text>
      </View>
    );
  } else if (waitingForChapters) {
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
        {/* Books come first: they are on screen as soon as they're read,
            while Next up's height waits on passages it loads after them. */}
        <Books books={books} onOpen={openBook} />
        <NextUp
          nextUp={nextUp}
          onOpen={({ chapter, passage }) =>
            void openPassage(chapter, passage.anchorVerse)
          }
        />
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader scrolled={scroll.scrolled} testID="home-header">
        {account.activeUserId ? (
          <Avatar
            initials={getAccountInitials(name)}
            accessibilityLabel={`${getAccountDisplayName(name)}. Accounts`}
            onPress={openAccounts}
            testID="home-account"
          />
        ) : (
          // Settings and sign-out stay reachable while the summary loads.
          <RoundButton
            icon={Gear}
            accessibilityLabel="Accounts and settings"
            onPress={openAccounts}
            testID="home-account"
          />
        )}
        <SyncStatusButton
          status={syncStatus}
          failedErrorText={failedErrorText}
          onPress={openSync}
          testID="home-sync"
        />
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing.xxl + insets.bottom },
        ]}
        onScroll={scroll.onScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={pullToRefresh}
            colors={[theme.roles.accentPrimary]}
          />
        }
        testID="home-scroll"
      >
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
            {waitingForChapters ? SYNC_SUMMARY[syncStatus] : chaptersLabel}
          </Text>
        </View>
        {body}
      </ScrollView>
      <AccountsSheet visible={accountsOpen} onClose={closeAccounts} />
    </View>
  );
}
