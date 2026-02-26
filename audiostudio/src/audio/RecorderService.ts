import Sound, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  OutputFormatAndroidType,
} from 'react-native-nitro-sound';
import { PermissionsAndroid, Platform } from 'react-native';

class RecorderService {
  private recording = false;

  private async ensureAndroidMicPermission(): Promise<void> {
    if (Platform.OS !== 'android') return;

    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (alreadyGranted) {
      console.log('[RecorderService] RECORD_AUDIO permission already granted');
      return;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'AudioStudio needs microphone access to record audio.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );

    console.log('[RecorderService] RECORD_AUDIO permission result:', granted);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Microphone permission denied');
    }
  }

  async startRecording(): Promise<string> {
    await this.ensureAndroidMicPermission();

    const audioSet = {
      AudioSamplingRate: 44100,
      AudioChannels: 1,
      AudioEncodingBitRate: 128000,
      AudioSourceAndroid: AudioSourceAndroidType.MIC,
      OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
    };
    console.log('[RecorderService] recording config:', {
      platform: Platform.OS,
      outputFormatAndroid: 'MPEG_4',
      audioEncoderAndroid: 'AAC',
      sampleRateHz: audioSet.AudioSamplingRate,
      channels: audioSet.AudioChannels,
      bitRate: audioSet.AudioEncodingBitRate,
    });

    // On Android let NitroSound choose its default cache path to avoid
    // scoped-storage path edge cases during recorder initialization.
    const requestedPath =
      Platform.OS === 'android' ? undefined : `record_${Date.now()}.m4a`;
    const path = await Sound.startRecorder(requestedPath, audioSet);

    console.log('[RecorderService] start path:', path);
    console.log('[RecorderService] start extension:', path.split('.').pop()?.toLowerCase());

    this.recording = true;
    return path;
  }

  async stopRecording(): Promise<string> {
    if (!this.recording) throw new Error("Not recording");

    const result = await Sound.stopRecorder();
    console.log('[RecorderService] stop path:', result);
    console.log('[RecorderService] stop extension:', result.split('.').pop()?.toLowerCase());
    this.recording = false;
    return result;
  }
}

export default new RecorderService();
