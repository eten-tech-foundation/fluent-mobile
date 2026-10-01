import { kvStorage } from './storage';
import {
  DEFAULT_UI_VERSION,
  isUiVersion,
  type UiVersion,
} from '../theme/uiVersionTypes';

const PREFERENCE_KEYS = {
  UPLOAD_OVER_CELLULAR: 'pref_upload_over_cellular',
  UI_VERSION: 'pref_ui_version',
} as const;

export type { UiVersion };

export type UserPreferences = {
  uploadOverCellular: boolean;
  uiVersion: UiVersion;
};

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  uploadOverCellular: false,
  uiVersion: DEFAULT_UI_VERSION,
};

type PreferencesListener = () => void;

const listeners: PreferencesListener[] = [];

let cachedPreferences: UserPreferences = DEFAULT_USER_PREFERENCES;

function readUploadOverCellularFromStorage(): boolean {
  return kvStorage.getItemSync(PREFERENCE_KEYS.UPLOAD_OVER_CELLULAR) === 'true';
}

function readUiVersionFromStorage(): UiVersion {
  const raw = kvStorage.getItemSync(PREFERENCE_KEYS.UI_VERSION) ?? undefined;
  return isUiVersion(raw) ? raw : DEFAULT_UI_VERSION;
}

function refreshCachedPreferences(): UserPreferences {
  const uploadOverCellular = readUploadOverCellularFromStorage();
  const uiVersion = readUiVersionFromStorage();

  if (
    cachedPreferences.uploadOverCellular === uploadOverCellular &&
    cachedPreferences.uiVersion === uiVersion
  ) {
    return cachedPreferences;
  }

  cachedPreferences = { uploadOverCellular, uiVersion };
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

  if (updates.uiVersion !== undefined) {
    kvStorage.setItemSync(PREFERENCE_KEYS.UI_VERSION, updates.uiVersion);
  }

  notifyUserPreferencesChanged();
}

export function getUploadOverCellular(): boolean {
  return getUserPreferenceValue('uploadOverCellular');
}

export function setUploadOverCellular(enabled: boolean): void {
  setUserPreferences({ uploadOverCellular: enabled });
}

export function getUiVersion(): UiVersion {
  return getUserPreferenceValue('uiVersion');
}

export function setUiVersion(version: UiVersion): void {
  setUserPreferences({ uiVersion: version });
}
