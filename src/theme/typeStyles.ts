/**
 * Figma named type styles (Foundations · 03 Type), the one source for these
 * metrics. Families are still TBD in Figma, so callers pass today's.
 * Leave `sans` undefined until real fonts are loaded: on Android a named but
 * unloaded family drops weights 500/600 to regular, while no family keeps them.
 */
function style(
  fontFamily: string | undefined,
  fontSize: number,
  lineHeight: number,
  fontWeight: '400' | '500' | '600' | '700',
  uppercase = false,
) {
  return {
    ...(fontFamily ? { fontFamily } : {}),
    fontSize,
    lineHeight,
    fontWeight,
    includeFontPadding: false,
    ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
}

export function buildTypeStyles(sans: string | undefined, mono: string) {
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
    /** Passage title, eyebrows. 500 renders as 400 in `monospace` until DM Mono loads. */
    overline: style(mono, 20, 24, '500', true),
    /** References and metadata under a title. */
    meta: style(mono, 14, 20, '400', true),
  };
}

/**
 * Figma `type/telugu/*`: same sizes, line height at least 1.5× so stacked
 * conjuncts don't clip. Layer over the base style for Telugu text.
 */
export type TypeStyleName = keyof ReturnType<typeof buildTypeStyles>;

export const teluguTypeOverrides = {
  reading: { lineHeight: 64 },
  readingStrong: { lineHeight: 64 },
  heading: { lineHeight: 64 },
  lead: { lineHeight: 48 },
  title: { lineHeight: 28 },
  body: { lineHeight: 28 },
} as const satisfies Partial<Record<TypeStyleName, { lineHeight: number }>>;
