/**
 * ViewChapter.tsx
 *
 * Owns: route params, chapter/verse data loading, UI state, audio metadata
 *       display, and rendering.
 *
 * Audio recording/playback state and controls live entirely in useVerseAudio.
 *
 * Assumed location: src/screens/ViewChapter.tsx
 */

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
  StyleSheet,
} from 'react-native';
import { Waveform } from '@simform_solutions/react-native-audio-waveform';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import RNFS from 'react-native-fs';

import { appStyles as styles } from '../appStyles';
import { RootStackParamList } from '../../types/navigation/types';
import { ChapterAssignmentData, VerseData } from '../../types/db/types';
import { getChapterAssignmentById, getBibleTexts } from '../../db/queries';
import { getExistingChapterAudio } from '../../utils/audioStorage';
import { logger } from '../../utils/logger';
import {
  useVerseAudio,
  VerseAudioEntry,
  VerseAudioState,
} from '../../hooks/useVerseAudio';

const log = logger.create('ViewChapter');

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ── types ─────────────────────────────────────────────────────────────────────

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

type AudioMetadata = {
  path: string;
  fileName: string;
  extension: string;
  size: number;
  formattedSize: string;
  modifiedAt?: string;
  mimeType: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'm4a':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/opus';
    default:
      return 'unknown';
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ViewChapter() {
  const navigation = useNavigation();
  const { chapterId, chapterName, language, projectName } =
    useRoute<Route>().params;

  // ── chapter / verse data ──────────────────────────────────────────────────
  const [verses, setVerses] = useState<VerseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [chapterData, setChapterData] = useState<ChapterAssignmentData | null>(
    null,
  );
  const [initialAudioMap, setInitialAudioMap] = useState<
    Record<number, VerseAudioEntry>
  >({});

  // ── ui state ──────────────────────────────────────────────────────────────
  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(
    null,
  );

  // ── audio (all recording / playback logic lives in the hook) ─────────────
  const {
    liveRef,
    staticRef,
    verseAudio,
    verseState,
    recordedPath,
    isPlaying,
    isPausedRecording,
    setPlayerState,
    setRecorderState,
    startRecord,
    pauseRecord,
    resumeRecord,
    stopRecord,
    playPause,
    stopPlayer,
    deleteAudio,
  } = useVerseAudio({
    selectedVerse,
    chapterData,
    projectName,
    initialAudioMap,
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const sourceText = verses.find(v => v.verseNumber === selectedVerse)?.text;

  // ── load chapter data ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const assignment = await getChapterAssignmentById(chapterId);
        if (!assignment) return;

        setChapterData(assignment);

        const texts = await getBibleTexts(
          assignment.bibleId,
          assignment.bookId,
          assignment.chapterNumber,
        );
        setVerses(texts);

        if (texts.length > 0) setSelectedVerse(texts[0].verseNumber);

        const existingFiles = await getExistingChapterAudio(
          projectName,
          assignment.bookCode ?? String(assignment.bookId),
          assignment.chapterNumber,
        );

        const audioMap: Record<number, VerseAudioEntry> = {};
        for (const verse of texts) {
          const existingPath = existingFiles.get(verse.verseNumber) ?? null;
          audioMap[verse.verseNumber] = {
            state: (existingPath ? 'recorded' : 'idle') as VerseAudioState,
            path: existingPath,
          };
        }
        setInitialAudioMap(audioMap);
      } catch (error) {
        log.error('Error loading chapter data:', { error });
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // ── load audio file metadata for display ─────────────────────────────────
  useEffect(() => {
    async function loadAudioMetadata() {
      if (!recordedPath) {
        setAudioMetadata(null);
        return;
      }
      try {
        const stat = await RNFS.stat(recordedPath);
        const fileName = recordedPath.split('/').pop() ?? 'unknown';
        const extension = fileName.split('.').pop() ?? '';
        setAudioMetadata({
          path: recordedPath,
          fileName,
          extension,
          size: Number(stat.size),
          formattedSize: formatBytes(Number(stat.size)),
          modifiedAt: stat.mtime?.toString(),
          mimeType: getMimeType(extension),
        });
      } catch (err) {
        log.error('Failed to load audio metadata', { err });
      }
    }
    loadAudioMetadata();
  }, [recordedPath]);

  // ── verse selection ───────────────────────────────────────────────────────
  function selectVerse(v: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedVerse(v);
    setSourceExpanded(true);
  }

  function toggleSource() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSourceExpanded(prev => !prev);
  }

  // ── guards ────────────────────────────────────────────────────────────────
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

  // ── render ────────────────────────────────────────────────────────────────
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
        {/* Source text card */}
        <View style={styles.cardColumn}>
          <Text style={styles.cardTitle}>
            {chapterData.bibleName} — Verse {selectedVerse}
          </Text>
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

        {/* Recording / Playback card */}
        <View style={styles.cardColumn}>
          <Text style={styles.cardTitle}>
            {language} — Verse {selectedVerse}
          </Text>

          <View
            style={[
              localStyles.waveformRow,
              verseState !== 'recording' && localStyles.hidden,
            ]}
          >
            <Waveform
              key={`live-${selectedVerse}`}
              mode="live"
              ref={liveRef}
              candleSpace={3}
              candleWidth={4}
              waveColor="#1a6ef5"
              containerStyle={localStyles.waveform}
              onRecorderStateChange={setRecorderState}
            />
          </View>

          <View
            style={[
              localStyles.waveformRow,
              verseState !== 'recorded' && localStyles.hidden,
            ]}
          >
            {recordedPath ? (
              <Waveform
                key={`static-${selectedVerse}-${recordedPath}`}
                mode="static"
                ref={staticRef}
                path={recordedPath}
                candleSpace={3}
                candleWidth={4}
                waveColor="#c0cfe8"
                scrubColor="#1a6ef5"
                containerStyle={localStyles.waveform}
                onPlayerStateChange={setPlayerState}
                onPanStateChange={() => {}}
              />
            ) : (
              <View style={localStyles.waveform} />
            )}
          </View>

          {verseState === 'idle' && (
            <View style={localStyles.controlRow}>
              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.recordBtnColor]}
                onPress={startRecord}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {verseState === 'recording' && (
            <View style={localStyles.controlRow}>
              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.pauseBtnColor]}
                onPress={isPausedRecording ? resumeRecord : pauseRecord}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPausedRecording ? 'play' : 'pause'}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.stopBtnColor]}
                onPress={stopRecord}
                activeOpacity={0.8}
              >
                <Ionicons name="stop" size={20} color="#fff" />
              </TouchableOpacity>

              {recordedPath && (
                <TouchableOpacity
                  style={[localStyles.iconBtn, localStyles.deleteBtnColor]}
                  onPress={deleteAudio}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {verseState === 'recorded' && (
            <View style={localStyles.controlRow}>
              <TouchableOpacity
                style={[
                  localStyles.iconBtn,
                  isPlaying
                    ? localStyles.pauseBtnColor
                    : localStyles.playBtnColor,
                ]}
                onPress={playPause}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.stopBtnColor]}
                onPress={stopPlayer}
                activeOpacity={0.8}
              >
                <Ionicons name="stop" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.recordBtnColor]}
                onPress={startRecord}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.iconBtn, localStyles.deleteBtnColor]}
                onPress={deleteAudio}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
        {audioMetadata && (
          <View style={localStyles.metaContainer}>
            <Text style={localStyles.metaTitle}>Audio Details</Text>
            <Text style={localStyles.metaText}>
              Name: {audioMetadata.fileName}
            </Text>
            <Text style={localStyles.metaText}>
              Extension: .{audioMetadata.extension}
            </Text>
            <Text style={localStyles.metaText}>
              Type: {audioMetadata.mimeType}
            </Text>
            <Text style={localStyles.metaText}>
              Size: {audioMetadata.formattedSize}
            </Text>
            <Text style={localStyles.metaText}>Path:</Text>
            <Text style={localStyles.metaPath}>{audioMetadata.path}</Text>
            {audioMetadata.modifiedAt && (
              <Text style={localStyles.metaText}>
                Modified: {audioMetadata.modifiedAt}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {verses.length > 0 ? (
          verses.map(verse => {
            const va = verseAudio[verse.verseNumber];
            const hasRecording = va?.state === 'recorded';
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

const localStyles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  waveform: {
    flex: 1,
    height: 60,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnColor: { backgroundColor: '#e53935' },
  pauseBtnColor: { backgroundColor: '#f57c00' },
  playBtnColor: { backgroundColor: '#1a6ef5' },
  stopBtnColor: { backgroundColor: '#546e7a' },
  deleteBtnColor: { backgroundColor: '#b71c1c' },
  metaContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f5f7fb',
    borderWidth: 1,
    borderColor: '#dbe3f0',
  },
  metaTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  metaText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 4,
  },
  metaPath: {
    fontSize: 11,
    color: '#546e7a',
  },
});
