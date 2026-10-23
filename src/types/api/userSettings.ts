/**
 * Account settings for GET/PUT `/self/settings` (#754 / fluent-api#434).
 * Mobile keeps Verse/Pericope `displayMode` device-local per account (#777);
 * it does not push/pull that key. Other keys (e.g. web suppressions) are opaque.
 */
export type ApiDisplayMode = 'verse' | 'pericope';

export type ApiUserSettings = {
  displayMode?: ApiDisplayMode | null;
  [key: string]: unknown;
};

/**
 * Response metadata from fluent-api#434 — not stored inside the settings blob.
 * Capability flags may still appear on responses; mobile no longer gates or
 * issues displayMode PUTs (#777).
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
