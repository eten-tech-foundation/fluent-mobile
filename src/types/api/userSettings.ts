/**
 * Account settings for GET/PUT `/self/settings` (#754 / fluent-api#434).
 * Mobile owns `displayMode`; other keys (e.g. web suppressions) are opaque.
 */
export type ApiDisplayMode = 'verse' | 'pericope';

export type ApiUserSettings = {
  displayMode?: ApiDisplayMode | null;
  [key: string]: unknown;
};

/**
 * Response metadata from fluent-api#434 — not stored inside the settings blob.
 * Both flags must be strictly `true` before mobile issues a displayMode-only PUT.
 */
export type SettingsCapabilities = {
  partialMerge?: boolean;
  displayMode?: boolean;
};

export type UserSettingsResponse = {
  settings: ApiUserSettings | null;
  updatedAt: string | null;
  settingsCapabilities?: SettingsCapabilities | null;
};

export type PutUserSettingsBody = {
  settings: {
    displayMode?: ApiDisplayMode | null;
  };
};
