/** One uW Translation Question + answer for a drafting unit (#190). */
export interface TranslationQuestionItem {
  id: string;
  question: string;
  /** Empty string when the answer is missing — still show the question. */
  answer: string;
}
