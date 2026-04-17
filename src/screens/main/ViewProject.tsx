import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { RootStackParamList } from '../../navigation/types';

const MOCK_CHAPTERS = [
  { id: '1', name: 'Matthew 1', status: 'Peer Review' },
  { id: '2', name: 'Matthew 2', status: 'Peer Review' },
  { id: '3', name: 'Matthew 3', status: 'Draft' },
  { id: '4', name: 'Matthew 4', status: 'Draft' },
  { id: '5', name: 'Matthew 5', status: 'Draft' },
  { id: '6', name: 'Matthew 6', status: 'Unassigned' },
  { id: '7', name: 'Matthew 7', status: 'Unassigned' },
];

type Nav = StackNavigationProp<RootStackParamList, 'Chapters'>;
type Route = RouteProp<RootStackParamList, 'Chapters'>;

export default function ChaptersScreen() {
  const navigation = useNavigation<Nav>();
  const { projectName, language } = useRoute<Route>().params;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color="#000" />
        <View>
          <Text style={styles.title}>{projectName}</Text>
          <Text style={styles.subtitle}>{language}</Text>
        </View>
      </TouchableOpacity>

      <FlatList
        data={MOCK_CHAPTERS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('VerseDetail', {
                chapterId: item.id,
                chapterName: item.name,
                projectName,
                language,
              })
            }
          >
            <Ionicons name="folder-outline" size={24} color="#000" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSubtitle}>{item.status}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#000" />
          </TouchableOpacity>
        )}
      />
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
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  listContent: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    padding: 16,
    gap: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 3,
  },
});
