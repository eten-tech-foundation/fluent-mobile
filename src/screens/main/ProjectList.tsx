import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { RootStackParamList } from '../../navigation/types';
import FluentLogo from '../../assets/icons/fluent-logo.svg';

const MOCK_PROJECTS = [
  { id: '1', name: 'Gujrat - Paschim - Gospels', language: 'Kachi Koli' },
  { id: '2', name: 'Gujrat - Paschim - Gospels', language: 'Varli Davri' },
];

type Nav = StackNavigationProp<RootStackParamList, 'Projects'>;

export default function ProjectsScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <FluentLogo width={160} height={54} />
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="folder-outline" size={24} color="#000" />
        <Text style={styles.sectionHeaderText}>Projects</Text>
      </View>

      <FlatList
        data={MOCK_PROJECTS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('Chapters', {
                projectId: item.id,
                projectName: item.name,
                language: item.language,
              })
            }
          >
            <Ionicons name="folder-outline" size={24} color="#000" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSubtitle}>{item.language}</Text>
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
  logoContainer: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#d1d1d6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '500',
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
