import { File } from 'expo-file-system';

/**
 * ADTS AAC is frame-delimited, so recovered recording segments can be joined
 * byte-for-byte before the existing M4A remux step (#567 / #233).
 */
export async function concatAdtsSegments(
  segmentUris: readonly string[],
  outputUri: string,
): Promise<string> {
  if (segmentUris.length === 0) {
    throw new Error('Cannot concatenate an empty recording');
  }
  if (segmentUris.length === 1) {
    return segmentUris[0];
  }

  const chunks = await Promise.all(
    segmentUris.map(async uri => new File(uri).bytes()),
  );
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  new File(outputUri).write(merged);
  return outputUri;
}
