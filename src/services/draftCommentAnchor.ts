/**
 * Draft-surface comment anchors for #451 (API459 verse | pericope).
 * Shared by surface create/filter and presentation counts — not My Work #703.
 */

import type { ChapterCommentAnchorInput } from '../types/api/chapterComments';

export type DraftCommentAnchor =
  | { kind: 'verse'; bibleTextId: number }
  | {
      kind: 'pericope';
      pericopeNumber: string;
      pericopeSetId?: number | null;
    };

export function draftCommentAnchorsEqual(
  a: DraftCommentAnchor | null,
  b: DraftCommentAnchor | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'verse' && b.kind === 'verse') {
    return a.bibleTextId === b.bibleTextId;
  }
  if (a.kind === 'pericope' && b.kind === 'pericope') {
    return a.pericopeNumber === b.pericopeNumber;
  }
  return false;
}

/** Map surface anchor → API459 create body anchor. */
export function toChapterCommentAnchorInput(
  anchor: DraftCommentAnchor,
): ChapterCommentAnchorInput {
  if (anchor.kind === 'verse') {
    return { kind: 'verse', bibleTextId: anchor.bibleTextId };
  }
  const input: ChapterCommentAnchorInput = {
    kind: 'pericope',
    pericopeNumber: anchor.pericopeNumber,
  };
  if (
    typeof anchor.pericopeSetId === 'number' &&
    Number.isInteger(anchor.pericopeSetId) &&
    anchor.pericopeSetId > 0
  ) {
    return { ...input, pericopeSetId: anchor.pericopeSetId };
  }
  return input;
}
