import {
  parseContentRange,
  serverMd5Hex,
  validateDownloadResult,
} from './downloadResultValidation';

describe('parseContentRange', () => {
  it('parses a complete range with total', () => {
    expect(parseContentRange('bytes 500-999/1000')).toEqual({
      start: 500,
      end: 999,
      total: 1000,
    });
  });

  it('accepts an unknown total and rejects malformed values', () => {
    expect(parseContentRange('bytes 0-9/*')).toEqual({
      start: 0,
      end: 9,
      total: undefined,
    });
    expect(parseContentRange('bytes */1000')).toBeUndefined();
    expect(parseContentRange('bytes 10-5/100')).toBeUndefined();
    expect(parseContentRange('bytes 0-100/100')).toBeUndefined();
    expect(parseContentRange('items 0-9/10')).toBeUndefined();
    expect(parseContentRange(undefined)).toBeUndefined();
  });
});

describe('serverMd5Hex', () => {
  it('reads an S3 single-part ETag as md5 and ignores multipart/opaque ETags', () => {
    expect(serverMd5Hex({ ETag: '"9e107d9d372bb6826bd81d3542a419d6"' })).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    );
    expect(
      serverMd5Hex({ etag: '"9e107d9d372bb6826bd81d3542a419d6-3"' }),
    ).toBeUndefined();
    expect(serverMd5Hex({ etag: '"0x8DC1234ABCD"' })).toBeUndefined();
  });

  it('does not treat SSE-KMS / SSE-C ETags as MD5 digests', () => {
    const md5 = '9e107d9d372bb6826bd81d3542a419d6';
    expect(
      serverMd5Hex({
        ETag: `"${md5}"`,
        'x-amz-server-side-encryption': 'aws:kms',
      }),
    ).toBeUndefined();
    expect(
      serverMd5Hex({
        ETag: `"${md5}"`,
        'x-amz-server-side-encryption': 'aws:kms:dsse',
      }),
    ).toBeUndefined();
    expect(
      serverMd5Hex({
        ETag: `"${md5}"`,
        'x-amz-server-side-encryption-customer-algorithm': 'AES256',
      }),
    ).toBeUndefined();
    // SSE-S3 ETags are still plain MD5s.
    expect(
      serverMd5Hex({
        ETag: `"${md5}"`,
        'x-amz-server-side-encryption': 'AES256',
      }),
    ).toBe(md5);
  });

  it('decodes Content-MD5 (base64) to hex', () => {
    // md5("The quick brown fox jumps over the lazy dog")
    expect(serverMd5Hex({ 'Content-MD5': 'nhB9nTcrtoJr2B01QqQZ1g==' })).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    );
    expect(serverMd5Hex({ 'content-md5': '!!not-base64!!' })).toBeUndefined();
  });
});

describe('validateDownloadResult', () => {
  const fresh200 = (
    overrides: Partial<Parameters<typeof validateDownloadResult>[0]> = {},
  ) =>
    validateDownloadResult({
      status: 200,
      headers: { 'content-length': '1000', etag: '"e1"' },
      resumed: false,
      expectedTotalBytes: 1000,
      fileSize: 1000,
      kind: 'audio',
      ...overrides,
    });

  it('accepts a fresh 200 whose Content-Length, expected size and file size agree', () => {
    expect(fresh200()).toEqual({
      ok: true,
      finalBytes: 1000,
    });
  });

  it('treats 401/403 as an expired URL: restart (re-resolve), never a completed file', () => {
    // Expo appended the XML error body to the file; 240 bytes of garbage.
    expect(fresh200({ status: 403, fileSize: 240 })).toEqual({
      ok: false,
      action: 'restart',
      reason: 'expired or unauthorised URL (HTTP 403)',
    });
    expect(fresh200({ status: 401 })).toMatchObject({ action: 'restart' });
  });

  it('fails other non-2xx statuses and restarts on 416', () => {
    expect(fresh200({ status: 500 })).toMatchObject({
      ok: false,
      action: 'fail',
    });
    expect(fresh200({ status: 404 })).toMatchObject({
      ok: false,
      action: 'fail',
    });
    expect(fresh200({ status: 416, resumed: true })).toMatchObject({
      action: 'restart',
    });
    expect(fresh200({ status: undefined })).toMatchObject({ action: 'fail' });
  });

  it('rejects an HTML / XML / JSON body served with 200 for an audio item', () => {
    expect(
      fresh200({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        fileSize: 512,
        expectedTotalBytes: undefined,
      }),
    ).toMatchObject({
      action: 'restart',
      reason: 'non-audio body (text/html)',
    });
    expect(
      fresh200({
        headers: { 'content-type': 'application/xml' },
        expectedTotalBytes: undefined,
        fileSize: 300,
      }),
    ).toMatchObject({ action: 'restart' });
    // Text items may legitimately be JSON.
    expect(
      fresh200({
        headers: { 'content-type': 'application/json' },
        kind: 'text',
        expectedTotalBytes: undefined,
        fileSize: 300,
      }),
    ).toMatchObject({ ok: true });
  });

  it('restarts when the final file size disagrees with the response or the manifest', () => {
    expect(fresh200({ fileSize: 999 })).toMatchObject({
      action: 'restart',
      reason: 'file size 999 != expected 1000',
    });
    expect(fresh200({ headers: { 'content-length': '900' } })).toMatchObject({
      action: 'restart',
      reason: 'Content-Length 900 != expected 1000',
    });
    expect(
      fresh200({ fileSize: 0, expectedTotalBytes: undefined, headers: {} }),
    ).toMatchObject({
      action: 'restart',
      reason: 'destination file empty',
    });
    expect(fresh200({ fileSize: undefined })).toMatchObject({
      action: 'fail',
      reason: 'destination file missing',
    });
  });

  describe('resumed transfers', () => {
    const resumed = (
      overrides: Partial<Parameters<typeof validateDownloadResult>[0]> = {},
    ) =>
      validateDownloadResult({
        status: 206,
        headers: {
          'content-range': 'bytes 400-999/1000',
          // Partial Content-Length is only the tail — must not be used as size.
          'content-length': '600',
          etag: '"e1"',
        },
        resumed: true,
        resumeOffset: 400,
        expectedTotalBytes: 1000,
        fileSize: 1000,
        kind: 'audio',
        ...overrides,
      });

    it('accepts a 206 whose Content-Range offset/total match the local offset, manifest size and final file', () => {
      expect(resumed()).toEqual({
        ok: true,
        finalBytes: 1000,
      });
    });

    it('never uses the partial Content-Length as the final size', () => {
      // File is only 600 bytes: Expo would have overwritten rather than
      // appended, or the partial was lost — reject even though the tail
      // Content-Length "matches".
      expect(resumed({ fileSize: 600 })).toMatchObject({
        action: 'restart',
        reason: 'file size 600 != expected 1000',
      });
    });

    it('restarts cleanly when the server ignored Range (200 appended onto the partial)', () => {
      expect(
        resumed({
          status: 200,
          headers: { 'content-length': '1000' },
          fileSize: 1400,
        }),
      ).toEqual({
        ok: false,
        action: 'restart',
        reason: 'range ignored (HTTP 200 on resume)',
      });
    });

    it('restarts on a Content-Range offset that does not match what was requested', () => {
      expect(
        resumed({ headers: { 'content-range': 'bytes 0-999/1000' } }),
      ).toMatchObject({
        action: 'restart',
        reason: 'Content-Range start 0 != resume offset 400',
      });
    });

    it('restarts when the object total changed or the range does not reach the end', () => {
      expect(
        resumed({ headers: { 'content-range': 'bytes 400-1199/1200' } }),
      ).toMatchObject({ reason: 'Content-Range total 1200 != expected 1000' });
      expect(
        resumed({ headers: { 'content-range': 'bytes 400-899/1000' } }),
      ).toMatchObject({ reason: 'partial response ends at 899, total 1000' });
      expect(
        resumed({ headers: { 'content-range': 'bytes 400-999/*' } }),
      ).toMatchObject({ action: 'restart' });
      expect(resumed({ headers: {} })).toMatchObject({
        reason: 'missing or malformed Content-Range on 206',
      });
    });

    it('treats a 403 on resume as an expired URL and discards the polluted partial', () => {
      expect(resumed({ status: 403, headers: {}, fileSize: 640 })).toEqual({
        ok: false,
        action: 'restart',
        reason: 'expired or unauthorised URL (HTTP 403)',
      });
    });

    it('accepts a 416 only when the local file was already complete', () => {
      expect(
        resumed({
          status: 416,
          headers: { 'content-range': 'bytes */1000' },
          resumeOffset: 1000,
          fileSize: 1000,
        }),
      ).toMatchObject({ ok: true, finalBytes: 1000 });
      expect(
        resumed({ status: 416, headers: {}, resumeOffset: 400, fileSize: 400 }),
      ).toMatchObject({ action: 'restart', reason: 'HTTP 416' });
      // Without an exact expected size a 416 is never trusted as complete.
      expect(
        resumed({
          status: 416,
          headers: {},
          resumeOffset: 1000,
          fileSize: 1000,
          expectedTotalBytes: undefined,
        }),
      ).toMatchObject({ action: 'restart' });
    });
  });

  it('checks the file md5 against a server digest when both exist', () => {
    const md5 = '9e107d9d372bb6826bd81d3542a419d6';
    expect(
      fresh200({ headers: { etag: `"${md5}"` }, fileMd5: md5.toUpperCase() }),
    ).toMatchObject({ ok: true });
    expect(
      fresh200({ headers: { etag: `"${md5}"` }, fileMd5: 'f'.repeat(32) }),
    ).toMatchObject({ action: 'restart', reason: 'md5 mismatch' });
    // No server digest → md5 is not evidence either way.
    expect(
      fresh200({ headers: { etag: '"0x8DC"' }, fileMd5: 'abc' }),
    ).toMatchObject({
      ok: true,
    });
  });
});
