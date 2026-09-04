import {
  RECORD_SOURCE_TEXT_SYNCING,
  RECORD_SOURCE_TEXT_UNAVAILABLE,
} from '../constants/messages';
import { recordSourceTextHint } from './recordSourceTextHint';

describe('recordSourceTextHint', () => {
  it('returns null when bible text is ready', () => {
    expect(recordSourceTextHint(42, false)).toBeNull();
    expect(recordSourceTextHint(42, true)).toBeNull();
  });

  it('says still syncing while sync is in flight', () => {
    expect(recordSourceTextHint(null, true)).toBe(RECORD_SOURCE_TEXT_SYNCING);
  });

  it('does not claim syncing when sync is idle and text is missing', () => {
    expect(recordSourceTextHint(null, false)).toBe(
      RECORD_SOURCE_TEXT_UNAVAILABLE,
    );
  });
});
