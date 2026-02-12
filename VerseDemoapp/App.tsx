import React, { useState } from 'react';
import { View,Text, StyleSheet,TouchableOpacity,PermissionsAndroid,Platform,} from 'react-native';
import NitroSound from 'react-native-nitro-sound';
import { FFmpegKit } from 'ffmpeg-kit-react-native';
import RNFS from 'react-native-fs';

const convertToRequiredWav = async (inputPath: string) => {
  const outputPath = `${RNFS.DocumentDirectoryPath}/recorded_48k_24bit_mono.wav`;

  const command = `-y -i "${inputPath}" -ar 48000 -ac 1 -c:a pcm_s24le "${outputPath}"`;

  console.log('FFmpeg command:', command);

  await FFmpegKit.execute(command);

  console.log('Converted file saved at:', outputPath);
  return outputPath;
};

export default function App() {
  const [recording, setRecording] = useState(false);
  const [recordPath, setRecordPath] = useState<string | null>(null);

  const requestPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const start = async () => {
    const ok = await requestPermission();
    if (!ok) return;

    const path = await NitroSound.startRecorder();
    setRecordPath(path);
    setRecording(true);
  };

  const stop = async () => {
    const path = await NitroSound.stopRecorder();
    setRecording(false);
  
    console.log('Recorded file:', path);
  
    if (path) {
      const convertedPath = await convertToRequiredWav(path);
      setRecordPath(convertedPath);
    }
  };
  

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Recorder</Text>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: recording ? '#e74c3c' : '#2ecc71' },
        ]}
        onPress={recording ? stop : start}
      >
        <Text style={styles.buttonText}>
          {recording ? 'Stop Recording' : 'Start Recording'}
        </Text>
      </TouchableOpacity>

      {recordPath && (
        <Text style={styles.pathText}>
          Saved at:
          {'\n'}
          {recordPath}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  button: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginVertical: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pathText: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});