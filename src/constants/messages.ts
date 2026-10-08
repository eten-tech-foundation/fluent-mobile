/** Prepare / download when blocked on cellular without the cellular toggle. */
export const TRANSFER_WAITING_WIFI_MESSAGE =
  'Connect to WiFi to upload and download. Or turn on Upload/Download over cellular in Settings.';

/** Sync Now hint — toggle lives on the same screen and in Settings. */
export const SYNC_NOW_CELLULAR_DISABLED_MESSAGE =
  'Connect to WiFi to upload and download. Or use Upload/Download over cellular (toggle below or in Settings).';

/** Sync / Prepare when blocked with no internet (transport gate). Same copy as PR #559 (#546). */
export const TRANSFER_OFFLINE_MESSAGE =
  'Connect to the internet to upload and download.';

/** Sync page fallback when a network/transport error leaks as a failed take (#604). */
export const UPLOAD_NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. We'll retry when you're back online.";

/** Sync page — pending takes the worker will not upload (pericope/orphan). */
export function formatUnuploadablePendingMessage(count: number): string {
  const noun = count === 1 ? 'recording' : 'recordings';
  return `${count} ${noun} can't upload yet — missing bible text.`;
}

export const PROJECTS_EMPTY_MESSAGE =
  'No projects are available right now. Connect to the internet to sync and find available work.';

export const MILESTONES_EMPTY_MESSAGE =
  'No milestones are available right now. Connect to the internet to sync and find available work.';

export const MY_WORK_EMPTY_MESSAGE =
  "You don't have any chapters to work on right now. Check the Milestones tab to find available work.";

export const PROJECT_CHAPTERS_EMPTY_MESSAGE =
  'No chapters are available in this project yet.';

export const RESOURCES_EMPTY_MESSAGE =
  'No resources are on this device yet. Download them from Prepare for Offline.';

/** Online tab-wide empty when every section loaded with no content (#188 / #591). */
export const RESOURCES_NONE_FOR_VERSE_MESSAGE =
  'No resources available for this verse';

/** Section-scoped Images & Maps failure copy (#191 / #348). */
export const IMAGES_MAPS_LOAD_ERROR = 'Images unavailable';

export const TRANSLATION_NOTES_LOAD_ERROR = 'Unable to load Translation Notes.';

export const TRANSLATION_NOTE_EMPTY_BODY = 'No note text available.';

export const TRANSLATION_QUESTIONS_LOAD_ERROR =
  'Unable to load Translation Questions.';

/** One label for drawer Sign Out and More Settings Log out (#622). */
export const ACCOUNT_SIGN_OUT_LABEL = 'Log out';

export const LOGOUT_UNSYNCED_TITLE = 'Unsynced work on device';
export const LOGOUT_UNSYNCED_MESSAGE =
  'You have recordings that have not been uploaded. Log out anyway?';
export const LOGOUT_UNSYNCED_CANCEL = 'Cancel';

export const REAUTH_PROMPT_TITLE = 'Session expired';
export const REAUTH_PROMPT_SUBTITLE = 'Sign in again to sync your work';
export const REAUTH_SCREEN_TITLE = 'Sign in again';
export const REAUTH_SCREEN_SUBTITLE =
  'Enter your password to refresh your session.';
export const REAUTH_SUBMIT_BUTTON = 'Sign in again';

export const DELETE_OFFLINE_RESOURCES_TITLE = 'Delete selected resources?';
export const DELETE_OFFLINE_RESOURCES_MESSAGE =
  "These files will be removed from your device. You'll need to re-download them if needed later.";
export const DELETE_OFFLINE_RESOURCES_CONFIRM = 'Delete';
export const DELETE_OFFLINE_RESOURCES_CANCEL = 'Cancel';

export const DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_TITLE = 'Delete failed';
export const DELETE_OFFLINE_RESOURCES_PARTIAL_FAIL_MESSAGE =
  'Some resources could not be removed. The list has been refreshed.';

export const OFFLINE_STORAGE_EMPTY_OTHER_PROJECTS =
  'No resources from other projects on this device.';

export const OFFLINE_STORAGE_SELECT_TO_DELETE = 'Select items to delete';
export const OFFLINE_STORAGE_DELETE_SELECTED = 'Delete Selected';

/** Record tab warning banners (issue #269). */
export const RECORD_TAKEN_CHAPTER_WARNING =
  'This chapter is assigned to another translator.';
export const RECORD_AUDIO_CONFLICT_WARNING =
  'Unresolved audio take conflict on this chapter/pericope.';

/** Record tab when local `bible_texts` row is missing (#448). */
export const RECORD_SOURCE_TEXT_SYNCING =
  'Source text still syncing for this verse — recording will unlock when ready.';
export const RECORD_SOURCE_TEXT_UNAVAILABLE =
  "Source text isn't available for this verse yet. Open Sync and tap Sync Now, then return here.";

/**
 * Leave prompt shown when the user navigates away from an in-progress take
 * (#49 / #570). Every leave path (tabs, back, Sync, account chip, verse
 * chevrons) reads from this one place — change the strings here only.
 */
export const CAPTURE_LEAVE_TITLE = 'Recording in progress';
export const CAPTURE_LEAVE_MESSAGE =
  'You have a take in progress. What would you like to do?';
export const CAPTURE_LEAVE_RESUME = 'Resume';
export const CAPTURE_LEAVE_DISCARD = 'Discard';
