/**
 * The one spring for Next movement that isn't a press: the player sheet, the
 * take fan and the Track row button. Foundations motion has no spring yet
 * (Q25 in docs/features/next-ui-redesign/open-questions.md).
 */
export const NEXT_SPRING = { damping: 22, stiffness: 240, mass: 1 } as const;
