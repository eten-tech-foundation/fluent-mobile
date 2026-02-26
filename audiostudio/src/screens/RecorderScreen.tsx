import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import RecorderService from '../audio/RecorderService';
import RecordingStore from '../audio/RecordingStore';
import { checkMedia3Bridge, exportAudio, mergeAudio, trimAudio } from '../native/Media3';

type ExportFormat = 'm4a' | 'mp4' | 'mp3';
type ExportAction = 'download' | 'share';

const FORMATS: ExportFormat[] = ['m4a', 'mp4', 'mp3'];

const extFromPath = (path: string) => {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'unknown';
};

const outputPathFor = (inputPath: string, prefix: string, format: ExportFormat) => {
  const slashIndex = inputPath.lastIndexOf('/');
  const parent = slashIndex >= 0 ? inputPath.slice(0, slashIndex) : '/storage/emulated/0/Download';
  return `${parent}/${prefix}_${Date.now()}.${format}`;
};

const outputPathForExport = (format: ExportFormat) => {
  if (Platform.OS === 'android') {
    return `/storage/emulated/0/Download/export_${Date.now()}.${format}`;
  }
  return `export_${Date.now()}.${format}`;
};

export default function RecorderScreen() {
  const [recording, setRecording] = useState(false);
  const [list, setList] = useState(RecordingStore.getAll());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [trimStartMs, setTrimStartMs] = useState('0');
  const [trimEndMs, setTrimEndMs] = useState('10000');
  const [spliceFormat, setSpliceFormat] = useState<ExportFormat>('m4a');
  const [mergeFormat, setMergeFormat] = useState<ExportFormat>('m4a');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');

  const selectedPrimary = useMemo(
    () => list.find(rec => selectedIds.includes(rec.id)) ?? list[0],
    [list, selectedIds],
  );

  const refreshList = () => setList([...RecordingStore.getAll()]);

  const start = async () => {
    try {
      const output = await RecorderService.startRecording();
      console.log('[Recorder] start output path:', output);
      console.log('[Recorder] start output type:', extFromPath(output));
      setRecording(true);
    } catch (e) {
      Alert.alert('Recording error', String(e));
    }
  };

  const stop = async () => {
    try {
      const path = await RecorderService.stopRecording();
      console.log('[Recorder] stop output path:', path);
      console.log('[Recorder] stop output type:', extFromPath(path));
      RecordingStore.add(path);
      refreshList();
      setRecording(false);
    } catch (e) {
      Alert.alert('Stop recording error', String(e));
    }
  };

  const mergeAll = async () => {
    try {
      const selected = list.filter(item => selectedIds.includes(item.id));
      const source = selected.length > 0 ? selected : list;
      if (source.length < 2) {
        Alert.alert('Need more files', 'Select at least 2 recordings to combine.');
        return;
      }

      if (mergeFormat === 'mp3') {
        console.log('[Recorder] mp3 export may fail on pure Media3 transformer builds.');
      }

      const output = outputPathFor(source[0].path, 'merged', mergeFormat);
      await mergeAudio(
        source.map(item => item.path),
        output,
      );

      RecordingStore.add(output);
      refreshList();
      Alert.alert('Combined', output);
    } catch (e) {
      Alert.alert('Combine failed', String(e));
    }
  };

  const spliceSelected = async () => {
    try {
      if (!selectedPrimary) {
        Alert.alert('No source', 'Select one recording to splice.');
        return;
      }
      const startMs = Number(trimStartMs);
      const endMs = Number(trimEndMs);
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        Alert.alert('Invalid range', 'Ensure endMs is greater than startMs.');
        return;
      }

      if (spliceFormat === 'mp3') {
        console.log('[Recorder] mp3 export may fail on pure Media3 transformer builds.');
      }

      const output = outputPathFor(selectedPrimary.path, 'splice', spliceFormat);
      await trimAudio(selectedPrimary.path, startMs, endMs, output);
      RecordingStore.add(output);
      refreshList();
      Alert.alert('Splice complete', output);
    } catch (e) {
      Alert.alert('Splice failed', String(e));
    }
  };

  const exportSelected = async (action: ExportAction) => {
    try {
      if (!selectedPrimary) {
        Alert.alert('No source', 'Select one recording to export.');
        return;
      }
      if (exportFormat === 'mp3') {
        console.log('[Recorder] mp3 export may fail on pure Media3 transformer builds.');
      }
      const requestedOutput = outputPathForExport(exportFormat);
      const actualOutput = await exportAudio(selectedPrimary.path, requestedOutput);
      console.log('[Recorder] export source path:', selectedPrimary.path);
      console.log('[Recorder] export source format:', extFromPath(selectedPrimary.path));
      console.log('[Recorder] export requested path:', requestedOutput);
      console.log('[Recorder] export actual saved location:', actualOutput);
      console.log('[Recorder] export selected format:', exportFormat);
      console.log('[Recorder] export is content uri:', actualOutput.startsWith('content://'));
      RecordingStore.add(actualOutput);
      refreshList();

      if (action === 'share') {
        await Share.share({
          title: 'Share Audio',
          message: `Audio exported: ${actualOutput}`,
          url: actualOutput,
        });
      }

      Alert.alert(
        action === 'share' ? 'Exported & Ready to Share' : 'Export complete',
        actualOutput,
      );
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  const exportWithOptions = () => {
    Alert.alert('Export Action', 'Choose what to do with exported file', [
      { text: 'Download', onPress: () => void exportSelected('download') },
      { text: 'Share', onPress: () => void exportSelected('share') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = (id: string) => {
    RecordingStore.remove(id);
    setSelectedIds(prev => prev.filter(item => item !== id));
    refreshList();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
    );
  };

  const renderFormatSelector = (
    label: string,
    value: ExportFormat,
    setValue: (next: ExportFormat) => void,
  ) => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <View style={styles.row}>
          {FORMATS.map(format => (
            <Pressable
              key={`${label}-${format}`}
              onPress={() => setValue(format)}
              style={[styles.pill, value === format && styles.pillActive]}>
              <Text style={styles.pillText}>{format.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Audio Recorder</Text>
        <Text style={styles.subtitle}>
          Multi-recording, splice, combine, export and native bridge verification.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Native Bridge Check</Text>
          <Pressable style={styles.primaryButton} onPress={checkMedia3Bridge}>
            <Text style={styles.primaryButtonText}>Verify Media3 Bridge</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Record</Text>
          <Pressable
            style={[styles.primaryButton, recording && styles.dangerButton]}
            onPress={recording ? stop : start}>
            <Text style={styles.primaryButtonText}>
              {recording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recordings ({list.length})</Text>
          {list.map(item => {
            const selected = selectedIds.includes(item.id);
            return (
              <View key={item.id} style={[styles.card, selected && styles.cardSelected]}>
                <Text style={styles.pathText}>{item.path}</Text>
                <Text style={styles.metaText}>
                  type: {extFromPath(item.path)} | created:{' '}
                  {new Date(item.createdAt).toLocaleTimeString()}
                </Text>
                <View style={styles.row}>
                  <Pressable style={styles.secondaryButton} onPress={() => toggleSelect(item.id)}>
                    <Text style={styles.secondaryButtonText}>
                      {selected ? 'Unselect' : 'Select'}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => remove(item.id)}>
                    <Text style={styles.secondaryButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Splice Selected</Text>
          <TextInput
            value={trimStartMs}
            onChangeText={setTrimStartMs}
            keyboardType="numeric"
            style={styles.input}
            placeholder="Start ms"
            placeholderTextColor="#8893a1"
          />
          <TextInput
            value={trimEndMs}
            onChangeText={setTrimEndMs}
            keyboardType="numeric"
            style={styles.input}
            placeholder="End ms"
            placeholderTextColor="#8893a1"
          />
          {renderFormatSelector('Splice Format', spliceFormat, setSpliceFormat)}
          <Pressable style={styles.primaryButton} onPress={spliceSelected}>
            <Text style={styles.primaryButtonText}>Splice</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Combine Selected (or all if none selected)</Text>
          {renderFormatSelector('Merge Format', mergeFormat, setMergeFormat)}
          <Pressable style={styles.primaryButton} onPress={mergeAll}>
            <Text style={styles.primaryButtonText}>Combine</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export Selected</Text>
          {renderFormatSelector('Export Format', exportFormat, setExportFormat)}
          <Pressable style={styles.primaryButton} onPress={exportWithOptions}>
            <Text style={styles.primaryButtonText}>Export Options</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1118',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  title: {
    color: '#f2f5f8',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9aa4b2',
    marginBottom: 8,
  },
  section: {
    backgroundColor: '#151d28',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: '#f2f5f8',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2387e9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#b43b53',
  },
  primaryButtonText: {
    color: '#f2f5f8',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#1d2632',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  cardSelected: {
    borderWidth: 1,
    borderColor: '#2387e9',
  },
  pathText: {
    color: '#d9e3ef',
    fontSize: 12,
  },
  metaText: {
    color: '#9aa4b2',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    backgroundColor: '#2f3c4f',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  deleteButton: {
    backgroundColor: '#7d2736',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    color: '#f2f5f8',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111823',
    color: '#f2f5f8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f3c4f',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pill: {
    backgroundColor: '#2f3c4f',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  pillActive: {
    backgroundColor: '#2387e9',
  },
  pillText: {
    color: '#f2f5f8',
    fontWeight: '600',
  },
});
