import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { logger } from '../../utils/logger';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { appStyles as styles } from '../appStyles';
import { RootStackParamList } from '../../types/navigationTypes';
import { ChapterAssignmentData, VerseData } from '../../types/dbTypes';
import { getChapterAssignmentById, getBibleTexts } from '../../db/queries';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

const log = logger.create('ViewChapterScreen');

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;
type VerseState = 'idle' | 'recording' | 'recorded';

export default function VerseDetailScreen() {
  const navigation = useNavigation();
  const { chapterId, chapterName, language, projectName } =
    useRoute<Route>().params;

  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [sourceExpanded, setSourceExpanded] = useState<boolean>(false);
  const [verseStates, setVerseStates] = useState<Record<number, VerseState>>(
    {},
  );
  const [verses, setVerses] = useState<VerseData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );

  useEffect(() => {
    const loadVerses = async () => {
      try {
        setLoading(true);

        const assignment = await getChapterAssignmentById(chapterId);

        if (assignment) {
          setChapterData(assignment);

          const texts = await getBibleTexts(
            assignment.bibleId,
            assignment.bookId,
            assignment.chapterNumber,
          );

          setVerses(texts);

          if (texts && texts.length > 0) {
            const firstVerseNumber = texts[0]?.verseNumber;
            if (firstVerseNumber !== null && firstVerseNumber !== undefined) {
              setSelectedVerse(firstVerseNumber);
            }
          }
        }
      } catch (error) {
        log.error('Error loading verses:', { error });
      } finally {
        setLoading(false);
      }
    };

    loadVerses();
  }, [chapterId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a6ef5" />
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

  const verseState = verseStates[selectedVerse] ?? 'idle';
  const selectedVerseData = verses.find(v => v.verseNumber === selectedVerse);
  const sourceText = selectedVerseData?.text;

  function toggleSource() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSourceExpanded(prev => !prev);
  }

  function handleRecord() {
    setVerseStates((prev: Record<number, VerseState>) => ({
      ...prev,
      [selectedVerse]:
        prev[selectedVerse] === 'recording' ? 'recorded' : 'recording',
    }));
  }

  function handleDelete() {
    setVerseStates((prev: Record<number, VerseState>) => ({
      ...prev,
      [selectedVerse]: 'idle',
    }));
  }

  function selectVerse(v: number) {
    setSelectedVerse(v);
    setSourceExpanded(false);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color="#000" />
        <View>
          <Text style={styles.titleMd}>{chapterName}</Text>
          <Text style={styles.subtitle}>{projectName}</Text>
        </View>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardColumn}>
          <Text style={styles.cardTitle}>
            {chapterData.bibleName} - Verse {selectedVerse}
          </Text>

          <View style={styles.playerRow}>
            <TouchableOpacity style={styles.playBtn}>
              <Ionicons name="play" size={16} color="#fff" />
            </TouchableOpacity>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
          </View>

          <TouchableOpacity
            onPress={toggleSource}
            style={styles.accordionHeader}
            activeOpacity={0.7}
          >
            <Text style={styles.accordionLabel}>
              {sourceExpanded ? 'Hide Source Text' : 'Show Source Text'}
            </Text>
            <Ionicons
              name={sourceExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#000"
            />
          </TouchableOpacity>

          {sourceExpanded && sourceText && (
            <ScrollView
              style={styles.sourceTextScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text style={styles.sourceText}>{sourceText}</Text>
            </ScrollView>
          )}
        </View>

        {/* Target Language Card */}
        <View style={styles.cardColumn}>
          <Text style={styles.cardTitle}>
            {language} - Verse {selectedVerse}
          </Text>

          {verseState === 'idle' && (
            <TouchableOpacity
              style={styles.recordBtn}
              onPress={handleRecord}
              activeOpacity={0.8}
            >
              <Ionicons name="mic" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {verseState === 'recording' && (
            <TouchableOpacity
              style={styles.recordBtn}
              onPress={handleRecord}
              activeOpacity={0.8}
            >
              <Ionicons name="stop" size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {verseState === 'recorded' && (
            <>
              <View style={styles.playerRow}>
                <TouchableOpacity style={styles.playBtn}>
                  <Ionicons name="play" size={16} color="#fff" />
                </TouchableOpacity>
                <View style={styles.progressTrack}>
                  <View style={styles.progressFillRecorded} />
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                activeOpacity={0.8}
              >
                <Ionicons name="trash" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Verse chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {verses.length > 0 ? (
          verses.map(verse => {
            const hasRecording =
              (verseStates[verse.verseNumber] ?? 'idle') === 'recorded';
            const isSelected = selectedVerse === verse.verseNumber;
            return (
              <TouchableOpacity
                key={verse.verseNumber}
                style={[styles.chip, isSelected && styles.activeChip]}
                onPress={() => selectVerse(verse.verseNumber)}
                activeOpacity={0.7}
              >
                {hasRecording && (
                  <Ionicons
                    name="mic"
                    size={10}
                    color="#1a6ef5"
                    style={styles.chipMic}
                  />
                )}
                <Text
                  style={[styles.chipText, isSelected && styles.activeChipText]}
                >
                  {verse.verseNumber}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.noVersesText}>No verses found</Text>
        )}
      </ScrollView>
    </View>
  );
}
