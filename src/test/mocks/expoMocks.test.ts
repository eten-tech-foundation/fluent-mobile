import * as SecureStore from './expo-secure-store';
import * as FileSystem from './expo-file-system';
import { AudioPlayer, AudioRecorder, resetAudioMock } from './expo-audio';
import { resetFileSystemMock } from './expo-file-system';
import { resetSecureStoreMock } from './expo-secure-store';

describe('Expo module mocks', () => {
  beforeEach(() => {
    resetSecureStoreMock();
    resetFileSystemMock();
    resetAudioMock();
  });

  describe('expo-secure-store', () => {
    it('stores and retrieves values in memory', async () => {
      await SecureStore.setItemAsync('key', 'value');
      await expect(SecureStore.getItemAsync('key')).resolves.toBe('value');
      await SecureStore.deleteItemAsync('key');
      await expect(SecureStore.getItemAsync('key')).resolves.toBeNull();
    });
  });

  describe('expo-file-system', () => {
    it('writes and reads files in the virtual filesystem', async () => {
      const path = `${FileSystem.documentDirectory}recordings/test.m4a`;
      await FileSystem.writeAsStringAsync(path, 'audio-bytes');
      await expect(FileSystem.readAsStringAsync(path)).resolves.toBe(
        'audio-bytes',
      );
      await expect(FileSystem.getInfoAsync(path)).resolves.toMatchObject({
        exists: true,
        isDirectory: false,
      });
    });

    it('creates directories', async () => {
      const dir = `${FileSystem.documentDirectory}recordings/`;
      await FileSystem.makeDirectoryAsync(dir);
      await expect(FileSystem.getInfoAsync(dir)).resolves.toMatchObject({
        exists: true,
        isDirectory: true,
      });
    });
  });

  describe('expo-audio', () => {
    it('records and returns a mock uri', async () => {
      const recorder = new AudioRecorder();
      await recorder.prepareToRecordAsync();
      await recorder.startAsync();
      const result = await recorder.stopAsync();
      expect(result.uri).toBe('file:///mock-recording.m4a');
      expect(recorder.getStatus().isRecording).toBe(false);
    });

    it('loads and plays audio', async () => {
      const player = new AudioPlayer();
      await player.loadAsync({ uri: 'file:///mock-recording.m4a' });
      await player.playAsync();
      expect(player.getStatus()).toMatchObject({
        isLoaded: true,
        isPlaying: true,
      });
      await player.pauseAsync();
      expect(player.getStatus().isPlaying).toBe(false);
    });
  });
});
