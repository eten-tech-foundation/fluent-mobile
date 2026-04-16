import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { logger } from '../../utils/logger';
import { Project } from '../../types/dbTypes';
import { getProjects } from '../../db/queries';
import { useNavigation } from '@react-navigation/native';
import FluentLogo from '../../assets/icons/fluent-logo.svg';
import { RootStackParamList } from '../../types/navigationTypes';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { appStyles as styles } from '../appStyles';

const log = logger.create('ProjectListScreen');
type Nav = StackNavigationProp<RootStackParamList, 'Projects'>;

export default function ProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      log.error('Error loading projects:', { error });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a6ef5" />
      </View>
    );
  }

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
        data={projects}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardRow}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('Chapters', {
                projectId: item.id,
                projectName: item.name,
                language: item.target_language_name,
              })
            }
          >
            <Ionicons name="folder-outline" size={24} color="#000" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSubtitle}>
                {item.target_language_name}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#000" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
