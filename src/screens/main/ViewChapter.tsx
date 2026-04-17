import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { RootStackParamList } from '../../navigation/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const MOCK_VERSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SOURCE_TEXT: Record<number, string> = {
  1: 'Now when Jesus saw the crowds, he went up on a mountainside and sat down. His disciples came to him.',
  2: 'તેમણે પોતાનું મુખ ઉઘાડીને તેઓને ઉપદેશ કરતાં કહ્યું કે,',
  3: 'Blessed are the poor in spirit, for theirs is the kingdom of heaven.',
};

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

export default function VerseDetailScreen() {
  const navigation = useNavigation();
  const { chapterName, language } = useRoute<Route>().params;

  const [selectedVerse, setSelectedVerse] = useState(1);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [verseStates, setVerseStates] = useState<
    Record<number, 'idle' | 'recording' | 'recorded'>
  >({});

  const verseState = verseStates[selectedVerse] ?? 'idle';
  const sourceText = SOURCE_TEXT[selectedVerse];

  function toggleSource() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSourceExpanded(prev => !prev);
  }

  function handleRecord() {
    setVerseStates(prev => ({
      ...prev,
      [selectedVerse]:
        prev[selectedVerse] === 'recording' ? 'recorded' : 'recording',
    }));
  }

  function handleDelete() {
    setVerseStates(prev => ({ ...prev, [selectedVerse]: 'idle' }));
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
        <Text style={styles.title}>{chapterName}</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Gujarati IRV - Verse {selectedVerse}
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

        <View style={styles.card}>
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {MOCK_VERSES.map(v => {
          const hasRecording = (verseStates[v] ?? 'idle') === 'recorded';
          const isSelected = selectedVerse === v;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.chip, isSelected && styles.activeChip]}
              onPress={() => selectVerse(v)}
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
                {v}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a6ef5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
  },
  progressFill: {
    width: '20%',
    height: 4,
    backgroundColor: '#1a6ef5',
    borderRadius: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  accordionLabel: {
    fontSize: 14,
  },
  sourceTextScroll: {
    maxHeight: 72,
    marginTop: 10,
  },
  sourceText: {
    fontSize: 14,
    lineHeight: 24,
  },
  recordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 12,
  },
  deleteBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  chipsScroll: {
    flexGrow: 0,
    paddingVertical: 12,
  },
  chipsContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  chip: {
    minWidth: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeChip: {
    borderWidth: 2,
    borderColor: '#1a6ef5',
  },
  chipText: {
    fontSize: 16,
  },
  activeChipText: {
    color: '#1a6ef5',
    fontWeight: '600',
  },
  chipMic: {
    position: 'absolute',
    top: 3,
    right: 4,
  },
  progressFillRecorded: {
    width: '40%',
    height: 4,
    backgroundColor: '#1a6ef5',
    borderRadius: 2,
  },
});
