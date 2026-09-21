import { sanitizeUploadErrorForDisplay } from './sanitizeUploadError';

describe('sanitizeUploadErrorForDisplay', () => {
  it('maps audio storage 503 copy to a friendly line', () => {
    expect(sanitizeUploadErrorForDisplay('Audio storage is unavailable')).toBe(
      'Audio storage is currently unavailable. Try again later.',
    );
  });

  it('maps 404 / assignment auth-mask text to a friendly fallback', () => {
    expect(
      sanitizeUploadErrorForDisplay(
        'Request failed with status 404: Not Found',
      ),
    ).toBe("Couldn't reach this recording on the server. Open Sync to retry.");
  });

  it('does not treat local File not found as a 404 auth-mask', () => {
    const sanitized = sanitizeUploadErrorForDisplay(
      'File not found: /data/user/0/com.eten.fluent/files/recordings/rec_abc.m4a',
    );
    expect(sanitized).toBe('File not found');
  });

  it('strips Android storage paths from the message', () => {
    const raw =
      'Local file missing: /data/user/0/com.eten.fluent/files/recordings/rec_abc.m4a';
    const sanitized = sanitizeUploadErrorForDisplay(raw);
    expect(sanitized).not.toMatch(/\/data\/user\//);
    expect(sanitized).not.toMatch(/rec_abc\.m4a/);
    expect(sanitized).toMatch(/Local file missing/i);
  });

  it('strips /storage/ paths', () => {
    const sanitized = sanitizeUploadErrorForDisplay(
      'Failed to read /storage/emulated/0/Android/data/com.eten.fluent/files/take.m4a',
    );
    expect(sanitized).not.toMatch(/\/storage\//);
  });

  it('truncates long strings to 200 characters', () => {
    const raw = `Upload failed: ${'x'.repeat(400)}`;
    const sanitized = sanitizeUploadErrorForDisplay(raw);
    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized.endsWith('…')).toBe(true);
  });

  it('returns a generic fallback for empty or whitespace input', () => {
    expect(sanitizeUploadErrorForDisplay('')).toBe('Upload failed');
    expect(sanitizeUploadErrorForDisplay('   ')).toBe('Upload failed');
  });
});
