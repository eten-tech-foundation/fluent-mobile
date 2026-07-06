import { theme } from '../../theme';
import { logger } from '../../utils/logger';
import { BibleTab } from '../tabs/BibleTab';
import { useSync } from '../../hooks/useSync';
import { RecordTab } from '../tabs/RecordTab';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { onSyncComplete } from '../../services/syncEvents';
import { UserSettingsMenu } from '../../components/ui/UserSettingsMenu';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { useActiveAccountSummary } from '../../hooks/useActiveAccountSummary';
import { RootStackParamList } from '../../types/navigation/types';
import { DraftingHeader } from '../../components/layout/DraftingHeader';
import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  getLastActiveTab,
  setLastActiveTab,
} from '../../utils/draftingTabState';
import {
  DraftingProvider,
  // useDraftingContext,
} from '../context/DraftingContext';
import {
  DraftingTab,
  DraftingTabBar,
} from '../../components/layout/DraftingTabBar';
import {
  getBibleTexts,
  getChapterAssignmentById,
  getRecordedVerseNumbers,
} from '../../db/queries';

const log = logger.create('DraftingScreen');

type Nav = StackNavigationProp<RootStackParamList, 'VerseDetail'>;
type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

export default function DraftingScreen() {
  const navigation = useNavigation<Nav>();
  const { chapterId, chapterName } = useRoute<Route>().params;
  const { width: windowWidth } = useWindowDimensions();

  const [activeTab, setActiveTabState] = useState<DraftingTab>(
    () => getLastActiveTab(chapterId) ?? 'bible',
  );

  const setActiveTab = useCallback(
    (tab: DraftingTab) => {
      setActiveTabState(tab);
      setLastActiveTab(chapterId, tab);
    },
    [chapterId],
  );

  const [verses, setVerses] = useState<VerseData[]>([]);
  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [initialVerse, setInitialVerse] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [accountSwitcherVisible, setAccountSwitcherVisible] = useState(false);

  const { isSyncing, triggerSync } = useSync();
  const { status: syncStatus } = useSyncStatus({ isSyncing, refreshKey });
  const activeAccount = useActiveAccountSummary(refreshKey);
  const { refresh: refreshActiveAccount } = activeAccount;

  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const accountSwitcherAnchor = {
    top: 56,
    left: Math.max(16, windowWidth - 226),
  };

  const handleAccountPress = useCallback(() => {
    setAccountSwitcherVisible(true);
  }, []);

  const handleUserSwitched = useCallback(() => {
    refreshActiveAccount();
    setRefreshKey(key => key + 1);
  }, [refreshActiveAccount]);

  const renderHeader = () => (
    <DraftingHeader
      title={chapterName}
      onBack={goBack}
      syncStatus={syncStatus}
      onSyncPress={triggerSync}
      showAccountIndicator={activeAccount.hasMultipleAccounts}
      accountFirstName={activeAccount.firstName}
      accountLastName={activeAccount.lastName}
      accountEmail={activeAccount.email}
      onAccountPress={handleAccountPress}
    />
  );

  const renderAccountSwitcher = () => (
    <UserSettingsMenu
      visible={accountSwitcherVisible}
      onClose={() => setAccountSwitcherVisible(false)}
      anchor={accountSwitcherAnchor}
      onUserSwitched={handleUserSwitched}
    />
  );

  useEffect(() => {
    const unsubscribe = onSyncComplete(() => {
      setRefreshKey(key => key + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadVerses = async () => {
      try {
        setLoading(true);

        const assignment = await getChapterAssignmentById(chapterId);
        if (ignore) return;
        if (!assignment) {
          setChapterData(null);
          return;
        }

        setChapterData(assignment);

        const [texts, recordedVerseNumbers] = await Promise.all([
          getBibleTexts(
            assignment.bibleId,
            assignment.bookId,
            assignment.chapterNumber,
          ),
          getRecordedVerseNumbers(
            assignment.bibleId,
            assignment.bookId,
            assignment.chapterNumber,
          ),
        ]);

        if (ignore) return;

        setVerses(texts);

        const firstUnrecorded = texts.find(
          v => !recordedVerseNumbers.has(v.verseNumber),
        );
        const defaultVerse =
          firstUnrecorded?.verseNumber ?? texts[0]?.verseNumber ?? 1;
        setInitialVerse(defaultVerse);
      } catch (error) {
        log.error('Error loading verses', { error });
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadVerses();
    return () => {
      ignore = true;
    };
  }, [chapterId]);

  if (loading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
        {renderAccountSwitcher()}
      </ScreenContainer>
    );
  }

  if (!chapterData) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        {renderHeader()}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No chapter data found</Text>
        </View>
        {renderAccountSwitcher()}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <DraftingProvider verses={verses} initialVerse={initialVerse}>
        <View style={styles.screen}>
          {renderHeader()}

          <View style={styles.content}>
            {activeTab === 'bible' ? <BibleTab /> : <RecordTab />}
          </View>

          {/* <DraftingPlayerBar verses={verses} /> */}

          <DraftingTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
        {renderAccountSwitcher()}
      </DraftingProvider>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
});
