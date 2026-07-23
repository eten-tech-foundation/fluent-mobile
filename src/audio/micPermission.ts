import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import type { MicPermissionResult } from './types';

type PermissionLike = {
  granted: boolean;
  status?: string;
};

function mapPermission(response: PermissionLike): MicPermissionResult {
  if (response.granted) {
    return 'granted';
  }
  if (response.status === 'undetermined') {
    return 'undetermined';
  }
  return 'denied';
}

/** Read current mic permission without prompting. */
export async function getMicPermission(): Promise<MicPermissionResult> {
  return mapPermission(await getRecordingPermissionsAsync());
}

/**
 * Request microphone permission via expo-audio.
 * Returns a recoverable state — callers decide UI (no Alert here).
 */
export async function requestMicPermission(): Promise<MicPermissionResult> {
  return mapPermission(await requestRecordingPermissionsAsync());
}
