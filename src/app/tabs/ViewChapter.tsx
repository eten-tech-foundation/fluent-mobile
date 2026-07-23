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
import { RootStackParamList } from '../../types/navigation/types';
import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import {
  getChapterAssignmentById,
  getBibleTexts,
  getBibleTextId,
} from '../../db/queries';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { PlaybackProgressBar } from '../../components/ui/PlaybackProgressBar';
import { useVerseAudio } from '../../hooks/useVerseAudio';
import { requestMicPermission } from '../../audio/micPermission';

const log = logger.create('ViewChapter');

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

export default function ViewChapter() {
  const navigation = useNavigation();
  const { chapterId, chapterName, language, projectName } =
    useRoute<Route>().params;

  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [sourceExpanded, setSourceExpanded] = useState<boolean>(false);
  const [verses, setVerses] = useState<VerseData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  const [micDenied, setMicDenied] = useState(false);

  const verseAudio = useVerseAudio({ bibleTextId });

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (!cancelled) {
        setBibleTextId(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterData, selectedVerse]);

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

  const selectedVerseData = verses.find(v => v.verseNumber === selectedVerse);
  const sourceText = selectedVerseData?.text;
  const uiState = verseAudio.state;
  const showRecorded =
    uiState === 'recorded' || uiState === 'playing' || uiState === 'saving';
  const showRecording = uiState === 'recording' || uiState === 'paused';

  function toggleSource() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSourceExpanded(prev => !prev);
  }

  async function handleRecordPress() {
    if (showRecording) {
      await verseAudio.stop();
      return;
    }
    const permission = await requestMicPermission();
    if (permission !== 'granted') {
      setMicDenied(true);
      return;
    }
    setMicDenied(false);
    await verseAudio.start();
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

        <View style={styles.cardColumn}>
          <Text style={styles.cardTitle}>
            {language} - Verse {selectedVerse}
          </Text>

          {micDenied && (
            <Text style={styles.emptyText}>
              Microphone access is required to record.
            </Text>
          )}

          {uiState === 'idle' || uiState === 'error' ? (
            <TouchableOpacity
              style={styles.recordBtn}
              onPress={() => {
                void handleRecordPress();
              }}
              activeOpacity={0.8}
              disabled={bibleTextId === null}
            >
              <Ionicons name="mic" size={28} color="#fff" />
            </TouchableOpacity>
          ) : null}

          {showRecording ? (
            <View style={styles.playerRow}>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => {
                  void (uiState === 'paused'
                    ? verseAudio.resume()
                    : verseAudio.pause());
                }}
              >
                <Ionicons
                  name={uiState === 'paused' ? 'mic' : 'pause'}
                  size={16}
                  color="#fff"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.recordBtn}
                onPress={() => {
                  void handleRecordPress();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="stop" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          {showRecorded ? (
            <>
              <View style={styles.playerRow}>
                <TouchableOpacity
                  style={[
                    styles.playBtn,
                    !verseAudio.latest?.localFilePath && styles.playBtnDisabled,
                  ]}
                  onPress={() => {
                    void verseAudio.play();
                  }}
                  disabled={!verseAudio.latest?.localFilePath}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={uiState === 'playing' ? 'pause' : 'play'}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
                <PlaybackProgressBar
                  positionMs={verseAudio.positionMs}
                  durationMs={verseAudio.durationMs}
                />
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  void verseAudio.deleteCurrent();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {verses.length > 0 ? (
          verses.map(verse => {
            const hasRecording =
              verse.verseNumber === selectedVerse && Boolean(verseAudio.latest);
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
