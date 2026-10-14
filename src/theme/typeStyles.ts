/**
 * Figma named type styles (Foundations · 03 Type). Metrics are final; the
 * families are still TBD in Figma (Google Sans Flex / DM Mono placeholders),
 * so callers pass today's families and swap them in one place later.
 */
function style(
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  fontWeight: '400' | '500' | '600' | '700',
  uppercase = false,
) {
  return {
    fontFamily,
    fontSize,
    lineHeight,
    fontWeight,
    includeFontPadding: false,
    ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
}

export function buildTypeStyles(sans: string, mono: string) {
  return {
    /** Scripture. Pass `maxFontSizeMultiplier={theme.fontScale.readingMax}`. */
    reading: style(sans, 42, 52, '400'),
    /** The word being spoken. */
    readingStrong: style(sans, 42, 52, '700'),
    /** Screen headings ("Chapter 14"). */
    heading: style(sans, 42, 48, '700'),
    /** Long-form notes and explanations. */
    lead: style(sans, 32, 40, '400'),
    /** Passage reference, labels. */
    title: style(sans, 18, 24, '600'),
    /** List titles and body copy. */
    body: style(sans, 18, 24, '400'),
    /** Verse numbers in chips. */
    label: style(sans, 14, 20, '600'),
    /** Passage title, eyebrows. */
    overline: style(mono, 20, 24, '500', true),
    /** References and metadata under a title. */
    meta: style(mono, 14, 20, '400', true),
  };
}

/**
 * Figma `type/telugu/*`: same sizes, line height at least 1.5× so stacked
 * conjuncts don't clip. Layer over the base style for Telugu text.
 */
export const teluguTypeOverrides = {
  reading: { lineHeight: 64 },
  readingStrong: { lineHeight: 64 },
  heading: { lineHeight: 64 },
  lead: { lineHeight: 48 },
  title: { lineHeight: 28 },
  body: { lineHeight: 28 },
} as const;
