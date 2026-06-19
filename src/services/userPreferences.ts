import { kvStorage } from './storage';

const PREFERENCE_KEYS = {
  UPLOAD_OVER_CELLULAR: 'pref_upload_over_cellular',
} as const;

export type UserPreferences = {
  uploadOverCellular: boolean;
};

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  uploadOverCellular: false,
};

type PreferencesListener = () => void;

const listeners: PreferencesListener[] = [];

let cachedPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;

function readUploadOverCellularFromStorage(): boolean {
  return kvStorage.getItemSync(PREFERENCE_KEYS.UPLOAD_OVER_CELLULAR) === 'true';
}

function refreshCachedPreferences(): UserPreferences {
  const uploadOverCellular = readUploadOverCellularFromStorage();

  if (cachedPreferences.uploadOverCellular === uploadOverCellular) {
    return cachedPreferences;
  }

  cachedPreferences = { uploadOverCellular };
  return cachedPreferences;
}

export function subscribeToUserPreferences(
  onStoreChange: PreferencesListener,
): () => void {
  listeners.push(onStoreChange);
  return () => {
    const index = listeners.indexOf(onStoreChange);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

export function subscribeToPreference<K extends keyof UserPreferences>(
  key: K,
  listener: (value: UserPreferences[K]) => void,
): () => void {
  let lastValue = getUserPreferenceValue(key);

  return subscribeToUserPreferences(() => {
    const nextValue = getUserPreferenceValue(key);
    if (nextValue !== lastValue) {
      lastValue = nextValue;
      listener(nextValue);
    }
  });
}

export function notifyUserPreferencesChanged(): void {
  refreshCachedPreferences();
  listeners.forEach(listener => listener());
}

export function getUserPreferenceValue<K extends keyof UserPreferences>(
  key: K,
): UserPreferences[K] {
  return refreshCachedPreferences()[key];
}

export function getUserPreferences(): UserPreferences {
  return refreshCachedPreferences();
}

export function setUserPreferences(updates: Partial<UserPreferences>): void {
  if (updates.uploadOverCellular !== undefined) {
    kvStorage.setItemSync(
      PREFERENCE_KEYS.UPLOAD_OVER_CELLULAR,
      updates.uploadOverCellular ? 'true' : 'false',
    );
  }

  notifyUserPreferencesChanged();
}

export function getUploadOverCellular(): boolean {
  return getUserPreferenceValue('uploadOverCellular');
}

export function setUploadOverCellular(enabled: boolean): void {
  setUserPreferences({ uploadOverCellular: enabled });
}
