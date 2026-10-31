import type { Passage } from '../../../../hooks/usePassage';

/**
 * FIA listening steps. Their audio has no source yet (Q11 in
 * docs/features/next-ui-redesign/open-questions.md).
 */
export const STEPS = [
  'Hear & Heart',
  'Setting the Stage',
  'Defining the Scenes',
  'Embodying the Text',
  'Filling the Gaps',
  'Speaking the Word',
];

/** The player's pages: the script, then one per listening step. */
export const PAGE_COUNT = 1 + STEPS.length;

/** The script's page goes by the passage's reference. */
export function pageName(reference: string, page: number) {
  return page === 0 ? reference : STEPS[page - 1];
}

export type Ready = Extract<Passage, { status: 'ready' }>;
