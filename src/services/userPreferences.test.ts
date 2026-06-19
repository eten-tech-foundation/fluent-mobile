import {
  getUploadOverCellular,
  getUserPreferences,
  setUploadOverCellular,
  setUserPreferences,
  subscribeToPreference,
} from './userPreferences';
import { kvStorage } from './storage';

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
const mockSetItemSync = kvStorage.setItemSync as jest.Mock;

describe('userPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemSync.mockReturnValue(null);
    mockSetItemSync.mockImplementation((_key, value) => {
      mockGetItemSync.mockReturnValue(value);
    });
  });

  it('returns default preferences when nothing is stored', () => {
    expect(getUserPreferences()).toEqual({ uploadOverCellular: false });
  });

  it('reads upload over cellular from storage', () => {
    mockGetItemSync.mockReturnValue('true');
    expect(getUserPreferences()).toEqual({ uploadOverCellular: true });
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
