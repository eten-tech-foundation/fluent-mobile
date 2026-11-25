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

/** Next Home has no Milestones tab to point to. */
export const HOME_EMPTY_MESSAGE =
  "You don't have any chapters to work on right now. Connect to the internet to sync and find available work.";

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

/** Next player's notes status, under the waveform in Listen (#902). */
export const PASSAGE_NOTES_LOADING = 'Loading translation notes…';
export const PASSAGE_NOTES_RETRYING = 'Trying translation notes again…';
export const PASSAGE_NOTES_EMPTY = 'No translation notes for this passage.';
export const PASSAGE_NOTES_PARTIAL = "Some translation notes didn't load.";
export const PASSAGE_NOTES_OFFLINE =
  "Some translation notes aren't on this phone. Connect to the internet to load them.";

export const TRANSLATION_NOTE_EMPTY_BODY = 'No note text available.';

export const TRANSLATION_QUESTIONS_LOAD_ERROR =
  'Unable to load Translation Questions.';

export const TRANSLATION_QUESTION_NO_ANSWER =
  'No answer available for this question.';

/** Next passage Translation Questions (#911). */
export const PASSAGE_QUESTIONS_TITLE = 'Translation Questions';
export const PASSAGE_QUESTIONS_OPEN_DETAIL =
  'Questions and answers to check the meaning';
export const PASSAGE_QUESTIONS_LOADING = 'Loading Translation Questions';
export const PASSAGE_QUESTIONS_EMPTY = 'No Translation Questions here.';
export const PASSAGE_QUESTIONS_UNPREPARED =
  "Translation Questions aren't on this phone yet. Download them from Prepare for Offline while you're online.";
export const PASSAGE_QUESTIONS_NO_TEXT =
  "Translation Questions show once this chapter's text is on the phone.";
export const PASSAGE_QUESTIONS_RETRY = 'Retry';
export const TRANSLATION_QUESTIONS_RETRY_LABEL =
  'Retry loading Translation Questions';
export const PASSAGE_QUESTION_SHOW_ANSWER = 'Shows the answer';
export const PASSAGE_QUESTION_HIDE_ANSWER = 'Hides the answer';

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

/** Prepare for Offline — manifest fetch failed for the current selection (#702). */
export const PREPARE_OFFLINE_MANIFEST_LOAD_ERROR =
  "Couldn't load downloadable resources for the selected chapters. Check your connection and try again.";

/** Prepare for Offline — selection resolved but API returned nothing to download (#702). */
export const PREPARE_OFFLINE_NO_RESOURCES_FOR_SELECTION =
  'No downloadable resources are available for the selected chapters.';

/** Prepare for Offline — manifest still loading after chapter selection (#702). */
export const PREPARE_OFFLINE_MANIFEST_LOADING =
  'Loading resources for the selected chapters…';

/** Record tab warning banners (issue #269). */
export const RECORD_TAKEN_CHAPTER_WARNING =
  'This chapter is assigned to another translator.';
export const RECORD_AUDIO_CONFLICT_WARNING =
  'Unresolved audio take conflict on this chapter/pericope.';

/** Next passage's Send to Peer Check (#908) and later stages (#909). */
export const STAGE_SEND_CONFIRM = 'Send';
export const STAGE_SEND_SENDING = 'Sending…';
export const STAGE_SEND_RETRY = 'Try again';
export const STAGE_SEND_CANCEL = 'Cancel';
export const STAGE_SEND_OK = 'OK';
export const STAGE_SEND_CAPTURING = 'Finish the take in progress first.';
export const STAGE_SEND_FAILED =
  "Couldn't send this chapter. Nothing changed. Try again.";
export const STAGE_SEND_COMPLETE_FAILED =
  "The server hasn't confirmed Complete, so this chapter isn't Complete yet. Try again.";
export function stageSendBlocked(destinationLabel: string): string {
  return `This chapter can't be sent to ${destinationLabel} right now. Nothing changed.`;
}
export function stageQueuedTitle(destinationLabel?: string): string {
  return destinationLabel
    ? `Waiting to send to ${destinationLabel}`
    : 'Waiting to send';
}
export const STAGE_QUEUED_DETAIL =
  "Saved on this phone. The server doesn't have it yet.";
export const PEER_CHECK_SENT_TITLE = 'Sent to Peer Check';
export const PEER_CHECK_SENT_DETAIL = 'The server has it.';
export function stageSendKept(chapterName: string): string {
  return `The server kept ${chapterName} where it was, so it wasn't sent.`;
}

/** Stage advance blocked while selected takes cannot upload (#585). */
export const RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING =
  "Can't advance yet — some takes on this chapter can't upload. Open Sync for details.";

/**
 * Settings is Pericope but the project has no usable local pericope data
 * (#588) — Bible/Record fall back to verse units with this explanation.
 */
export const PERICOPE_UNAVAILABLE_WARNING =
  "Pericopes aren't available for this project. Showing verses instead.";

/** Record tab when local `bible_texts` row is missing (#448). */
export const RECORD_SOURCE_TEXT_SYNCING =
  'Source text still syncing for this verse — recording will unlock when ready.';
export const RECORD_SOURCE_TEXT_UNAVAILABLE =
  "Source text isn't available for this verse yet.";
export const RECORD_SOURCE_TEXT_OPEN_SYNC = 'Open Sync';

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
export const CAPTURE_SAVING_TITLE = 'Saving take';
export const CAPTURE_SAVING_MESSAGE = 'Wait until this take finishes saving.';

/**
 * Next passage player: why the Record key is off, or what the take in
 * progress waits on.
 */
export const RECORD_NOT_OPEN =
  "Recording isn't open on this chapter right now.";
export const RECORD_MAX_TAKES =
  'This passage has 5 takes. Delete one to record another.';
/** The cap counts verse-by-verse takes too (#623), which the player doesn't show. */
export const RECORD_MAX_VERSE_TAKES =
  'A verse here has 5 takes. Delete one in classic drafting to record.';
export const RECORD_MAX_IN_PASSAGE_TAKES =
  'This verse is in 5 passage takes. Switch to Pericope in Settings and delete one to record it on its own.';
export const RECORD_MAX_WITH_PASSAGE_TAKES =
  'This verse has 5 takes, counting passage takes over it. Delete one to record.';
export const RECORD_NO_PERICOPE =
  "This chapter isn't split into pericopes. Record it in classic drafting.";
/** Choosing this take would replace an official take recorded as a verse or passage the other way (#896). */
export const RECORD_REPLACEMENT_BLOCKED_TITLE = "Can't use this take yet";
export const RECORD_REPLACEMENT_BLOCKED_MESSAGE =
  "An official take overlaps it, recorded as a verse or passage the other way. Replacing that isn't supported yet, so nothing changed. You can still listen to every take.";
export const RECORD_OBSERVER =
  "You're observing this project, so you can listen but not record.";
/** Another translator's take is official; the player only lists yours. */
export const RECORD_OTHERS_OFFICIAL =
  "Another translator's take is official. Change it in classic drafting.";
export const RECORD_VERSE_BY_VERSE = 'Recorded verse by verse';
export const recordedOnTheirOwn = (count: number, total: number) =>
  `${count} of ${total} verses recorded on their own`;
export const RECORD_OVER_VERSES_TITLE = 'Record the whole passage?';
/** Names its verses when the passage is wider than the page, e.g. "v. 1–7". */
export const pickOverVersesTitle = (takeNumber: number, verses?: string) =>
  `Use passage take ${takeNumber} for ${verses ?? 'the whole passage'}?`;
export const PICK_OVER_VERSES_CONFIRM = 'Use it';
export const RECORD_OVER_VERSES_MESSAGE =
  "The verses recorded on their own here won't be used anymore.";
export const pickOverPassageTitle = (takeNumber: number, verse: number) =>
  `Use take ${takeNumber} for v. ${verse}?`;
export const recordInPassageTake = (takeNumber: number) =>
  `This verse is in passage take ${takeNumber}.`;
export const recordOverPassageTitle = (verse: number) =>
  `Record v. ${verse} on its own?`;
type RangedTake = {
  takeNumber: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};
const takeRange = (take: RangedTake) =>
  take.startChapter === take.endChapter
    ? `v. ${take.startVerse}–${take.endVerse}`
    : `${take.startChapter}:${take.startVerse}–${take.endChapter}:${take.endVerse}`;
export const recordOverPassageMessage = (take: RangedTake) =>
  `Passage take ${take.takeNumber} won't be used for ${takeRange(
    take,
  )} anymore, so the rest of those verses will need recording too.`;
/** Swapping one passage take for another over a verse. */
export const swapPassageMessage = (take: RangedTake) =>
  `Passage take ${take.takeNumber} won't be used for ${takeRange(
    take,
  )} anymore.`;
export const RECORD_OVER_PASSAGE_CANCEL = 'Cancel';
export const RECORD_OVER_PASSAGE_CONFIRM = 'Record';
/**
 * Legacy drafting, opened from the Next player for what it has no design for
 * yet: resources.
 */
export const OPEN_CLASSIC_DRAFTING = 'Open in classic drafting';
export const OPEN_CLASSIC_DRAFTING_DETAIL = 'Resources';
/** Next's review of every account's takes here (#910). */
export const TAKE_REVIEW_TITLE = "Everyone's takes";
export const TAKE_REVIEW_OPEN_DETAIL = 'Listen to the takes others recorded';
export const TAKE_REVIEW_EMPTY = 'No takes here yet.';
export const TAKE_REVIEW_MISSING = "This take's audio isn't on this phone.";
export const TAKE_REVIEW_PLAY_FAILED = "Couldn't play this take. Try again.";
export const TAKE_REVIEW_OFFICIAL = 'Official';
export const TAKE_REVIEW_YOU = '(you)';
/** One line on the take card, so these stay short. */
export const RECORD_RECOVERED_TAKE = 'Take recovered. Eject finishes it.';
export const RECORD_PAUSED_TAKE = 'Paused. Eject finishes the take.';
/** Alert when Record would replace another account's paused take. */
export const RECORD_FOREIGN_PAUSED_TAKE =
  'Another account has a paused recording here. Switch to it to finish or discard it.';
/** Record couldn't get ready (mic request or take count failed); retryable. */
export const RECORD_SETUP_FAILED_TITLE = "Couldn't start recording";
export const RECORD_SETUP_FAILED_MESSAGE =
  'Something went wrong getting ready to record. Try Record again.';

/** Next passage Resources (#912). */
export const PASSAGE_RESOURCES_TITLE = 'Resources';
export const PASSAGE_RESOURCES_COLLAPSE = 'Collapse resources';
export const PASSAGE_IMAGES_TITLE = 'Images and maps';
export const PASSAGE_IMAGES_LOADING = 'Loading images and maps';
export const PASSAGE_IMAGES_EMPTY = 'No images or maps here.';
export const PASSAGE_IMAGES_UNPREPARED =
  "Images and maps aren't on this phone yet. Download them from Prepare for Offline while you're online.";
export const PASSAGE_IMAGES_NONE_OFFLINE =
  'No images or maps for this chapter are on this phone.';
export const PASSAGE_IMAGES_NO_TEXT =
  "Images and maps show once this chapter's text is on the phone.";
export const PASSAGE_IMAGES_FAILED = "Images and maps couldn't load.";
export const PASSAGE_IMAGES_RETRY = 'Retry';
export const PASSAGE_IMAGES_RETRY_LABEL = 'Retry loading images and maps';
export const PASSAGE_IMAGE_UNAVAILABLE = 'Image unavailable';
export const PASSAGE_IMAGE_GROW_HINT = 'Shows the whole image';
export const PASSAGE_IMAGE_SHRINK_HINT = 'Shows it smaller';
