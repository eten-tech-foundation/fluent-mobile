import {
  getUploadOverCellular,
  getUiVersion,
  getUserPreferences,
  setUiVersion,
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
      uiVersion: 'legacy',
    });
  });

  it('reads upload over cellular from storage', () => {
    mockPreferenceStore({ pref_upload_over_cellular: 'true' });
    expect(getUserPreferences()).toEqual({
      uploadOverCellular: true,
      uiVersion: 'legacy',
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

  it('persists uiVersion via setUserPreferences', () => {
    setUserPreferences({ uiVersion: 'next' });
    expect(mockSetItemSync).toHaveBeenCalledWith('pref_ui_version', 'next');
    expect(getUiVersion()).toBe('next');
  });

  it('persists uiVersion via setUiVersion', () => {
    setUiVersion('next');
    expect(mockSetItemSync).toHaveBeenCalledWith('pref_ui_version', 'next');
    expect(getUiVersion()).toBe('next');
  });

  it('falls back to legacy when stored uiVersion is invalid', () => {
    mockPreferenceStore({ pref_ui_version: 'dark' });
    expect(getUiVersion()).toBe('legacy');
  });

  it('reads a stored next uiVersion', () => {
    mockPreferenceStore({ pref_ui_version: 'next' });
    expect(getUiVersion()).toBe('next');
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

  it('notifies uiVersion subscribers when the version changes', () => {
    const listener = jest.fn();

    subscribeToPreference('uiVersion', listener);
    setUiVersion('next');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('next');

    setUiVersion('next');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
