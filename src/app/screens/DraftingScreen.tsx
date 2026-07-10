import { theme } from '../../theme';
import { logger } from '../../utils/logger';
import { BibleTab } from '../tabs/BibleTab';
import { useSync } from '../../hooks/useSync';
import { RecordTab } from '../tabs/RecordTab';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { onSyncComplete } from '../../services/syncEvents';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RootStackParamList } from '../../types/navigation/types';
import { DraftingHeader } from '../../components/layout/DraftingHeader';
import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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
  type TabSwitchGuardRef,
} from '../../types/drafting/types';
import { DraftingTabBar } from '../../components/layout/DraftingTabBar';
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
  const { chapterId, chapterName, recoverVerse } = useRoute<Route>().params;

  const [activeTab, setActiveTabState] = useState<DraftingTab>(
    () => getLastActiveTab(chapterId) ?? DraftingTab.Bible,
  );

  const setActiveTab = useCallback(
    (tab: DraftingTab) => {
      setActiveTabState(tab);
      setLastActiveTab(chapterId, tab);
    },
    [chapterId],
  );

  const tabSwitchGuardRef = useRef<TabSwitchGuardRef['current']>(null);

  const handleTabChange = useCallback(
    (tab: DraftingTab) => {
      if (tab === activeTab) return;
      const leaveRecord =
        activeTab === DraftingTab.Record && tab === DraftingTab.Bible;
      if (leaveRecord && tabSwitchGuardRef.current) {
        tabSwitchGuardRef.current(() => setActiveTab(tab));
        return;
      }
      setActiveTab(tab);
    },
    [activeTab, setActiveTab],
  );

  const [verses, setVerses] = useState<VerseData[]>([]);
  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [initialVerse, setInitialVerse] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const { isSyncing, triggerSync } = useSync();
  const { status: syncStatus } = useSyncStatus({ isSyncing, refreshKey });

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

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
        // A recovery navigation targets a specific verse; honor it when that
        // verse exists in the chapter, otherwise fall back to the default.
        const recoveredVerseExists =
          recoverVerse !== undefined &&
          texts.some(v => v.verseNumber === recoverVerse);
        setInitialVerse(recoveredVerseExists ? recoverVerse : defaultVerse);
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
  }, [chapterId, recoverVerse]);

  if (loading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <DraftingHeader title={chapterName} onBack={goBack} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!chapterData) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <DraftingHeader title={chapterName} onBack={goBack} />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No chapter data found</Text>
        </View>
      </ScreenContainer>
    );
  }

  const bookDisplayName = chapterData.bookName ?? chapterName;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <DraftingProvider
        verses={verses}
        initialVerse={initialVerse}
        chapterAssignment={chapterData}
        bookDisplayName={bookDisplayName}
      >
        <View style={styles.screen}>
          <DraftingHeader
            title={chapterName}
            onBack={goBack}
            syncStatus={syncStatus}
            onSyncPress={triggerSync}
          />

          <View style={styles.content}>
            <View
              style={[
                styles.tabPanel,
                activeTab !== DraftingTab.Bible && styles.tabHidden,
              ]}
              pointerEvents={activeTab === DraftingTab.Bible ? 'auto' : 'none'}
            >
              <BibleTab />
            </View>
            <View
              style={[
                styles.tabPanel,
                activeTab !== DraftingTab.Record && styles.tabHidden,
              ]}
              pointerEvents={activeTab === DraftingTab.Record ? 'auto' : 'none'}
            >
              <RecordTab tabSwitchGuardRef={tabSwitchGuardRef} />
            </View>
          </View>

          {/* <DraftingPlayerBar verses={verses} /> */}

          <DraftingTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </View>
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
  tabPanel: {
    flex: 1,
  },
  tabHidden: {
    display: 'none',
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
