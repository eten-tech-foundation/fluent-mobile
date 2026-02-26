import { NativeModules } from 'react-native';

const { Media3Audio } = NativeModules;

const getExtension = (path: string) => {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'unknown';
};

export const checkMedia3Bridge = () => {
  const bridgeReady =
    !!Media3Audio &&
    typeof Media3Audio.merge === 'function' &&
    typeof Media3Audio.trim === 'function';

  console.log('[Media3Bridge] moduleExists:', !!Media3Audio);
  console.log('[Media3Bridge] hasMerge:', typeof Media3Audio?.merge === 'function');
  console.log('[Media3Bridge] hasTrim:', typeof Media3Audio?.trim === 'function');
  console.log(
    '[Media3Bridge] hasExportAudio:',
    typeof Media3Audio?.exportAudio === 'function',
  );
  console.log('[Media3Bridge] bridgeReady:', bridgeReady);

  return bridgeReady;
};

export const mergeAudio = (files: string[], output: string) => {
  console.log('[Media3Bridge] merge input file types:', files.map(getExtension));
  console.log('[Media3Bridge] merge output file type:', getExtension(output));
  return Media3Audio.merge(files, output).then((result: string) => {
    console.log('[Media3Bridge] merge result location:', result);
    return result;
  });
};

export const trimAudio = (
  input: string,
  startMs: number,
  endMs: number,
  output: string,
) => {
  console.log('[Media3Bridge] trim input file type:', getExtension(input));
  console.log('[Media3Bridge] trim output file type:', getExtension(output));
  console.log('[Media3Bridge] trim range ms:', { startMs, endMs });
  return Media3Audio.trim(input, startMs, endMs, output).then((result: string) => {
    console.log('[Media3Bridge] trim result location:', result);
    return result;
  });
};

export const exportAudio = (input: string, output: string) => {
  console.log('[Media3Bridge] export input path:', input);
  console.log('[Media3Bridge] export requested output path:', output);
  console.log('[Media3Bridge] export input file type:', getExtension(input));
  console.log('[Media3Bridge] export output file type:', getExtension(output));
  if (typeof Media3Audio?.exportAudio === 'function') {
    return Media3Audio.exportAudio(input, output).then((result: string) => {
      console.log('[Media3Bridge] export actual saved location:', result);
      return result;
    });
  }

  // Fallback for builds where exportAudio is not yet visible in the native bridge.
  if (typeof Media3Audio?.merge === 'function') {
    console.log('[Media3Bridge] exportAudio missing, falling back to merge([input], output)');
    return Media3Audio.merge([input], output).then((result: string) => {
      console.log('[Media3Bridge] export fallback saved location:', result);
      return result;
    });
  }

  throw new Error(
    'Media3 bridge is missing exportAudio and merge. Rebuild the native app and verify package registration.',
  );
};
