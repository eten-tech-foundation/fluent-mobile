import {
  getUploadOverCellular,
  getUserPreferences,
  setUploadOverCellular,
  setUserPreferences,
  subscribeToPreference,
} from './userPreferences';
import { kvStorage } from './storage';
import { mockPreferenceStore } from '../test/mocks/preferenceStore';

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockSetItemSync = kvStorage.setItemSync as jest.Mock;

describe('userPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });

  it('returns default preferences when nothing is stored', () => {
    expect(getUserPreferences()).toEqual({
      uploadOverCellular: false,
    });
  });

  it('reads upload over cellular from storage', () => {
    mockPreferenceStore({ pref_upload_over_cellular: 'true' });
    expect(getUserPreferences()).toEqual({
      uploadOverCellular: true,
    });
    expect(getUploadOverCellular()).toBe(true);
  });

  it('persists upload over cellular via setUserPreferences', () => {
    setUserPreferences({ uploadOverCellular: true });
    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'true',
    );

    setUserPreferences({ uploadOverCellular: false });
    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'false',
    );
  });

  it('persists upload over cellular via setUploadOverCellular', () => {
    setUploadOverCellular(true);
    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'true',
    );
  });

  it('does not write a UI version key', () => {
    setUserPreferences({ uploadOverCellular: true });
    const keys = mockSetItemSync.mock.calls.map(call => call[0]);
    expect(keys).not.toContain('pref_ui_version');
  });

  it('notifies key-specific subscribers when a value changes', () => {
    const listener = jest.fn();

    subscribeToPreference('uploadOverCellular', listener);
    setUserPreferences({ uploadOverCellular: true });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(true);

    setUserPreferences({ uploadOverCellular: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
