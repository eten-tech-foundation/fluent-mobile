import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { theme } from '../../../theme';
import type { RootStackParamList } from '../../../types/navigation/types';
import type { ChapterAssignmentData, VerseData } from '../../../types/db/types';
import {
  getBibleTextId,
  getBibleTexts,
  getChapterAssignmentById,
} from '../../../db/queries';
import { StackScreenHeader } from '../../../components/layout/StackScreenHeader';
import { logger } from '../../../utils/logger';
import { BibleTab } from './BibleTab';
import { ChapterAudioPlayerBar } from './ChapterAudioPlayerBar';
import { DraftingTab, DraftingTabBar } from './DraftingTabBar';
import { RecordTab } from './RecordTab';

const log = logger.create('DraftingPage');

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

/**
 * Parent shell for the drafting page. Owns the selected verse and active tab
 * per issue #47 (this is a stub of that shell); the Record tab implementation
 * lives in {@link RecordTab} for issue #49.
 */
export default function DraftingPage() {
  const navigation = useNavigation();
  const { chapterId, chapterName, projectName } = useRoute<Route>().params;

  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );
  const [verses, setVerses] = useState<VerseData[]>([]);
  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DraftingTab>('record');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function loadChapter() {
      try {
        setLoading(true);
        const assignment = await getChapterAssignmentById(chapterId);
        if (!assignment) return;
        if (cancelled) return;
        setChapterData(assignment);

        const texts = await getBibleTexts(
          assignment.bibleId,
          assignment.bookId,
          assignment.chapterNumber,
        );
        if (cancelled) return;
        setVerses(texts);
        if (texts.length > 0) {
          setSelectedVerse(prev => {
            const stillValid = texts.some(t => t.verseNumber === prev);
            return stillValid ? prev : texts[0]?.verseNumber ?? 1;
          });
        }
      } catch (error) {
        log.error('Failed to load drafting page data', { chapterId, error });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadChapter();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  useEffect(() => {
    let cancelled = false;

    async function resolveId() {
      if (!chapterData) {
        setBibleTextId(null);
        return;
      }
      const id = await getBibleTextId(
        chapterData.bibleId,
        chapterData.bookId,
        chapterData.chapterNumber,
        selectedVerse,
      );
      if (!cancelled) setBibleTextId(id);
    }

    resolveId();
    return () => {
      cancelled = true;
    };
  }, [chapterData, selectedVerse]);

  const bookName = chapterData?.bookName ?? chapterName;
  const chapterNumber = chapterData?.chapterNumber ?? 1;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!chapterData) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>No chapter data found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="drafting-page">
      <StackScreenHeader
        title={`${bookName} ${chapterNumber}`}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
      />
      <View style={styles.body}>
        {activeTab === 'record' ? (
          <RecordTab
            bookName={bookName}
            chapterNumber={chapterNumber}
            verses={verses}
            selectedVerseNumber={selectedVerse}
            bibleTextIdForSelectedVerse={bibleTextId}
            onSelectVerse={setSelectedVerse}
          />
        ) : (
          <BibleTab />
        )}
      </View>
      <ChapterAudioPlayerBar />
      <DraftingTabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
  body: {
    flex: 1,
  },
});
