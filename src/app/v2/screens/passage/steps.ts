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

export type Ready = Extract<Passage, { status: 'ready' }>;
