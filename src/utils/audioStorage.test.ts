import * as FileSystem from 'expo-file-system/legacy';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import {
  deleteFile,
  ensureRecordingsDir,
  fileExists,
  fileSize,
  recordingPath,
} from './audioStorage';

describe('audioStorage', () => {
  beforeEach(() => {
    resetFileSystemMock();
  });

  describe('recordingPath', () => {
    it('builds an id-based path under documentDirectory/recordings', () => {
      expect(recordingPath('rec-abc-123')).toBe(
        `${FileSystem.documentDirectory}recordings/rec-abc-123.m4a`,
      );
    });

    it('does not encode project or book display names into the path', () => {
      const path = recordingPath('uuid-1');
      expect(path).not.toMatch(/Projects\//);
      expect(path).not.toMatch(/GEN|MAT|John/i);
      expect(path).toBe(`${FileSystem.documentDirectory}recordings/uuid-1.m4a`);
    });

    it('is stable for the same recording id', () => {
      expect(recordingPath('same-id')).toBe(recordingPath('same-id'));
    });
  });

  describe('ensureRecordingsDir', () => {
    it('creates the recordings directory when missing', async () => {
      const dir = `${FileSystem.documentDirectory}recordings/`;
      await expect(FileSystem.getInfoAsync(dir)).resolves.toMatchObject({
        exists: false,
      });

      await ensureRecordingsDir();

      await expect(FileSystem.getInfoAsync(dir)).resolves.toMatchObject({
        exists: true,
        isDirectory: true,
      });
    });

    it('is a no-op when the directory already exists', async () => {
      await ensureRecordingsDir();
      await ensureRecordingsDir();

      await expect(
        FileSystem.getInfoAsync(`${FileSystem.documentDirectory}recordings/`),
      ).resolves.toMatchObject({ exists: true, isDirectory: true });
    });
  });

  describe('fileExists', () => {
    it('returns false when the file is absent', async () => {
      await expect(fileExists(recordingPath('missing'))).resolves.toBe(false);
    });

    it('returns true after a take file is written at recordingPath', async () => {
      await ensureRecordingsDir();
      const path = recordingPath('take-1');
      await FileSystem.writeAsStringAsync(path, 'fake-audio');

      await expect(fileExists(path)).resolves.toBe(true);
    });
  });

  describe('fileSize', () => {
    it('returns undefined when the file does not exist', async () => {
      await expect(fileSize(recordingPath('gone'))).resolves.toBeUndefined();
    });

    it('returns the byte size of an existing take file', async () => {
      await ensureRecordingsDir();
      const path = recordingPath('sized');
      const contents = 'twelve-bytes';
      await FileSystem.writeAsStringAsync(path, contents);

      await expect(fileSize(path)).resolves.toBe(contents.length);
    });
  });

  describe('deleteFile', () => {
    it('removes an existing take file', async () => {
      await ensureRecordingsDir();
      const path = recordingPath('to-delete');
      await FileSystem.writeAsStringAsync(path, 'audio');
      await expect(fileExists(path)).resolves.toBe(true);

      await deleteFile(path);

      await expect(fileExists(path)).resolves.toBe(false);
    });

    it('is idempotent when the path is already gone', async () => {
      await expect(
        deleteFile(recordingPath('never-written')),
      ).resolves.toBeUndefined();
    });
  });
});
