import { resolveRecoveryHref, type RecoveryResolution } from './recoveryHref';
import {
  parseOptionalNumber,
  parseOptionalString,
  type SearchParamValue,
} from './routeParams';

/**
 * An existing `/verse-detail` URL. A saved recovery link opens the Next
 * passage through {@link resolveRecoveryHref}, using this link's chapter,
 * key and verse — not the drafting setting or where the passage now starts.
 * A chapter link with no recovery opens that chapter in Next: the Observer
 * screen when this account may only observe, otherwise the passage at the
 * chapter's first verse. It never opens classic drafting.
 */
export type VerseDetailLinkParams = {
  chapterId?: SearchParamValue;
  chapterName?: SearchParamValue;
  projectName?: SearchParamValue;
  language?: SearchParamValue;
  recoverSessionKey?: SearchParamValue;
  recoverVerse?: SearchParamValue;
};

export type VerseDetailRecovery = {
  kind: 'recover';
  chapterId: number;
  verse: number;
  sessionKey: string;
};

/** A chapter link with no recovery. Next opens it; classic drafting is gone. */
export type VerseDetailChapter = {
  kind: 'chapter';
  chapterId: number;
};

export type VerseDetailClass =
  | VerseDetailRecovery
  | VerseDetailChapter
  | { kind: 'invalid' };

export type VerseDetailRecoveryResult =
  | {
      kind: 'passage';
      href: Extract<RecoveryResolution, { status: 'open' }>['href'];
    }
  | { kind: 'missing' }
  | { kind: 'unread' }
  | { kind: 'stale' };

function positiveId(value: SearchParamValue): number | null {
  const n = parseOptionalNumber(value);
  if (n === undefined || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function classifyVerseDetailLink(
  params: VerseDetailLinkParams,
): VerseDetailClass {
  const chapterId = positiveId(params.chapterId);
  if (chapterId === null) return { kind: 'invalid' };

  const keyText = parseOptionalString(params.recoverSessionKey);
  const verseText = parseOptionalString(params.recoverVerse);
  const trimmedKey = keyText?.trim();
  const sessionKey = trimmedKey ? trimmedKey : undefined;
  const recovering = sessionKey !== undefined || verseText !== undefined;
  if (!recovering) {
    if (parseOptionalString(params.chapterName) === undefined) {
      return { kind: 'invalid' };
    }
    return { kind: 'chapter', chapterId };
  }

  const verse = positiveId(params.recoverVerse);
  if (sessionKey === undefined || verse === null) return { kind: 'invalid' };
  return { kind: 'recover', chapterId, verse, sessionKey };
}

/** The #914 adapter for a recovery link. Does not build a new session. */
export async function openVerseDetailRecovery(
  link: VerseDetailRecovery,
  isCurrent: () => boolean = () => true,
): Promise<VerseDetailRecoveryResult> {
  const result = await resolveRecoveryHref(
    {
      chapterAssignmentId: link.chapterId,
      verseNumber: link.verse,
      sessionKey: link.sessionKey,
    },
    isCurrent,
  );
  if (result.status === 'open') return { kind: 'passage', href: result.href };
  return { kind: result.status };
}
