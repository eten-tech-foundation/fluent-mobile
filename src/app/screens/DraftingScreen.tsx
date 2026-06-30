import { theme } from '../../theme';
import { logger } from '../../utils/logger';
import { BibleTab } from '../tabs/BibleTab';
import { useSync } from '../../hooks/useSync';
import { RecordTab } from '../tabs/RecordTab';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { RootStackParamList } from '../../types/navigation/types';
import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { DraftingHeader } from '../../components/layout/DraftingHeader';
import { getBibleTexts, getChapterAssignmentById } from '../../db/queries';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  DraftingProvider,
  useDraftingContext,
} from '../context/DraftingContext';
import {
  getLastActiveTab,
  setLastActiveTab,
} from '../../utils/draftingTabState';
import { SourceAudioPlayerBar } from '../../components/layout/SourceAudioPlayerBar';
import {
  DraftingTab,
  DraftingTabBar,
} from '../../components/layout/DraftingTabBar';

const log = logger.create('DraftingScreen');

type Nav = StackNavigationProp<RootStackParamList, 'VerseDetail'>;
type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

export default function DraftingScreen() {
  const navigation = useNavigation<Nav>();
  const { chapterId, chapterName } = useRoute<Route>().params;

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

  const { isSyncing, triggerSync } = useSync();

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  useEffect(() => {
    const loadVerses = async () => {
      try {
        setLoading(true);

        const assignment = await getChapterAssignmentById(chapterId);
        if (!assignment) {
          setChapterData(null);
          return;
        }

        setChapterData(assignment);

        const texts = await getBibleTexts(
          assignment.bibleId,
          assignment.bookId,
          assignment.chapterNumber,
        );
        setVerses(texts);

        // No recordings exist yet in this branch (recording is out of
        // scope), so "first verse with no recording" stubs to verse 1.
        const firstVerseNumber = texts[0]?.verseNumber;
        if (firstVerseNumber !== null && firstVerseNumber !== undefined) {
          setInitialVerse(firstVerseNumber);
        }
      } catch (error) {
        log.error('Error loading verses', { error });
      } finally {
        setLoading(false);
      }
    };

    loadVerses();
  }, [chapterId]);

  if (loading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
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

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <DraftingProvider verses={verses} initialVerse={initialVerse}>
        <View style={styles.screen}>
          <DraftingHeader
            title={chapterName}
            onBack={goBack}
            onSyncPress={triggerSync}
            isSyncing={isSyncing}
          />

          <View style={styles.content}>
            {activeTab === 'bible' ? <BibleTab /> : <RecordTab />}
          </View>

          <DraftingPlayerBar verses={verses} />

          <DraftingTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      </DraftingProvider>
    </ScreenContainer>
  );
}

/**
 * Thin wrapper so SourceAudioPlayerBar can read selectedVerse from
 * context without DraftingScreen needing to know about it directly.
 */
function DraftingPlayerBar({ verses }: { verses: VerseData[] }) {
  const { selectedVerse } = useDraftingContext();

  return <SourceAudioPlayerBar verses={verses} selectedVerse={selectedVerse} />;
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
