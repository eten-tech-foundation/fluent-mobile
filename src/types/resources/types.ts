/** Top-level Resources tab section slots (#189–#191). */
export type ResourceSectionId =
  | 'translationNotes'
  | 'translationQuestions'
  | 'imagesMaps';

/**
 * Local/mock unit payload for the Resources shell (#188).
 * Replace with SQLite-backed queries when #189+ / #192 land — no FluentAPI here.
 */
export interface UnitResourcesMock {
  /** Bold header reference (e.g. "Mark 14:1" or a mock range). */
  referenceLabel: string;
  /** Optional italic subtitle (passage/pericope title). */
  passageTitle?: string;
  /** Sections that have content for this unit (hide others). */
  sections: ResourceSectionId[];
}
