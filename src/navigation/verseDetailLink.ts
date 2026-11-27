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
 * A chapter link with no recovery still opens classic drafting; #920 removes
 * that screen once nothing still needs it.
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

export type VerseDetailClass =
  | VerseDetailRecovery
  | { kind: 'classic' }
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
    return { kind: 'classic' };
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
