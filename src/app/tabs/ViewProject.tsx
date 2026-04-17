import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  getProjectUnits,
  getChapterAssignmentsWithBooks,
} from '../../db/queries';
import { logger } from '../../utils/logger';
import { ChapterListItem } from '../../types/db/types';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { appStyles as styles } from '../appStyles';
import { RootStackParamList } from '../../types/navigationTypes';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

const log = logger.create('ChaptersScreen');

type Nav = StackNavigationProp<RootStackParamList, 'Chapters'>;
type Route = RouteProp<RootStackParamList, 'Chapters'>;

export default function ChaptersScreen() {
  const navigation = useNavigation<Nav>();
  const { projectId, projectName, language } = useRoute<Route>().params;

  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadChapters = async () => {
      try {
        const units = await getProjectUnits(projectId);

        if (!units || units.length === 0) {
          setChapters([]);
          return;
        }

        const rawId = units[0].id;

        if (rawId === null || rawId === undefined) {
          log.error('Invalid projectUnitId');
          setChapters([]);
          return;
        }

        const projectUnitId = Number(rawId);

        const chaptersData = await getChapterAssignmentsWithBooks(
          projectUnitId,
        );

        setChapters(chaptersData);
      } catch (error) {
        log.error('Error loading chapters:', { error });
      } finally {
        setLoading(false);
      }
    };

    loadChapters();
  }, [projectId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a6ef5" />
      </View>
    );
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
          <Text style={styles.titleLg}>{projectName}</Text>
          <Text style={styles.subtitle}>{language}</Text>
        </View>
      </TouchableOpacity>

      <FlatList
        data={chapters}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardRow}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('VerseDetail', {
                chapterId: item.id,
                chapterName: `${item.book_name} ${item.chapter_number}`,
                projectName,
                language,
              })
            }
          >
            <Ionicons name="folder-outline" size={24} color="#000" />

            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>
                {item.book_name} {item.chapter_number}
              </Text>

              <Text style={styles.cardSubtitle}>{item.status}</Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#000" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
