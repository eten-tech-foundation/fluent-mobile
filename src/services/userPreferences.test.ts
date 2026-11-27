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
      uiVersion: 'next',
    });
  });

  it('reads upload over cellular from storage', () => {
    mockPreferenceStore({ pref_upload_over_cellular: 'true' });
    expect(getUserPreferences()).toEqual({
      uploadOverCellular: true,
      uiVersion: 'next',
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

  it('does not store a legacy choice', () => {
    setUserPreferences({ uiVersion: 'legacy', uploadOverCellular: true });
    expect(mockSetItemSync).toHaveBeenCalledWith('pref_ui_version', 'next');
    expect(mockSetItemSync).toHaveBeenCalledWith(
      'pref_upload_over_cellular',
      'true',
    );
    expect(mockSetItemSync).not.toHaveBeenCalledWith(
      'pref_ui_version',
      'legacy',
    );
    expect(getUiVersion()).toBe('next');
    expect(getUploadOverCellular()).toBe(true);
  });

  it.each(['legacy', 'dark', ''])(
    'rewrites a stored %j ui version to Next once',
    stored => {
      const store = mockPreferenceStore({
        pref_ui_version: stored,
        pref_upload_over_cellular: 'true',
        '4:drafting_unit': 'pericope',
        '9:drafting_unit': 'verse',
      });

      expect(getUiVersion()).toBe('next');
      expect(store).toEqual({
        pref_ui_version: 'next',
        pref_upload_over_cellular: 'true',
        '4:drafting_unit': 'pericope',
        '9:drafting_unit': 'verse',
      });
      expect(mockSetItemSync).toHaveBeenCalledTimes(1);
      expect(mockSetItemSync).toHaveBeenCalledWith('pref_ui_version', 'next');

      getUserPreferences();
      expect(mockSetItemSync).toHaveBeenCalledTimes(1);
      expect(getUploadOverCellular()).toBe(true);
    },
  );

  it.each([undefined, null])(
    'leaves a missing ui version (%s) unset and still reports Next',
    missing => {
      const store = mockPreferenceStore({
        pref_upload_over_cellular: 'true',
        '4:drafting_unit': 'pericope',
      });
      const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
      mockGetItemSync.mockImplementation((key: string) =>
        key === 'pref_ui_version' ? missing : store[key] ?? null,
      );

      expect(getUserPreferences()).toEqual({
        uploadOverCellular: true,
        uiVersion: 'next',
      });
      expect(mockSetItemSync).not.toHaveBeenCalled();
      expect(store['4:drafting_unit']).toBe('pericope');
      expect(store).not.toHaveProperty('pref_ui_version');
    },
  );

  it('does not rewrite a stored Next value', () => {
    mockPreferenceStore({ pref_ui_version: 'next' });
    expect(getUiVersion()).toBe('next');
    expect(mockSetItemSync).not.toHaveBeenCalled();
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

  it('does not announce a legacy choice', () => {
    const listener = jest.fn();

    subscribeToPreference('uiVersion', listener);
    setUiVersion('legacy');

    expect(listener).not.toHaveBeenCalled();
    expect(getUiVersion()).toBe('next');
    expect(mockSetItemSync).not.toHaveBeenCalledWith(
      'pref_ui_version',
      'legacy',
    );
  });
});
