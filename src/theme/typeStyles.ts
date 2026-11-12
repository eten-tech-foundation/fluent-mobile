/**
 * Figma named type styles (Foundations · 03 Type), the one source for these
 * metrics. Each theme passes its own families.
 * Leave a family undefined unless it's linked natively with every weight, or
 * Android drops 500/600 to regular. Below API 28 it does anyway, since RN
 * only picks regular or bold there.
 */
function style(
  fontFamily: string | undefined,
  fontSize: number,
  lineHeight: number,
  fontWeight: '400' | '500' | '600' | '700',
  textTransform?: MetaCase,
) {
  return {
    ...(fontFamily ? { fontFamily } : {}),
    fontSize,
    lineHeight,
    fontWeight,
    includeFontPadding: false,
    ...(textTransform ? { textTransform } : {}),
  };
}

/** Legacy sets overline and meta in caps; Next doesn't. */
type MetaCase = 'uppercase' | 'none';

export type TypeFamilies = {
  /** heading, title */
  display: string | undefined;
  /** reading, lead, body, label */
  text: string | undefined;
  /** overline, meta */
  meta: string | undefined;
};

export function buildTypeStyles(
  { display, text, meta }: TypeFamilies,
  metaCase: MetaCase,
) {
  return {
    /**
     * Scripture at Figma's read-along size. The Next player reads at `lead`
     * instead (theme-figma-audit.md §6). Pass
     * `maxFontSizeMultiplier={theme.fontScale.readingMax}`; that doesn't cap
     * lineHeight, so see the recipe in figma-to-component.md.
     */
    reading: style(text, 42, 52, '400'),
    /** The word being spoken. */
    readingStrong: style(text, 42, 52, '700'),
    /** Screen headings ("Chapter 14"). */
    heading: style(display, 42, 48, '700'),
    /**
     * Long-form reading in the player: the script, translation notes and
     * listening materials, so moving between them keeps one size.
     */
    lead: style(text, 32, 40, '400'),
    /** Passage reference, labels, verse numbers in the script. */
    title: style(display, 18, 24, '600'),
    /** List titles and body copy. */
    body: style(text, 18, 24, '400'),
    /** Verse numbers in chips. */
    label: style(text, 14, 20, '600'),
    /** Passage title, eyebrows. In Legacy's `monospace`, 500 renders as 400. */
    overline: style(meta, 20, 24, '500', metaCase),
    /** References and metadata under a title. */
    meta: style(meta, 14, 20, '400', metaCase),
  };
}

export type TypeStyleName = keyof ReturnType<typeof buildTypeStyles>;

/** System families, kept by Legacy. */
export const systemFontFamilies: TypeFamilies = {
  display: undefined,
  text: undefined,
  meta: 'monospace',
};

/**
 * Figma's six `type/telugu/*` styles: same sizes, taller line heights so
 * stacked conjuncts don't clip. Layer over the base style for Telugu text.
 */
export const teluguTypeOverrides = {
  reading: { lineHeight: 64 },
  readingStrong: { lineHeight: 64 },
  heading: { lineHeight: 64 },
  lead: { lineHeight: 48 },
  title: { lineHeight: 28 },
  body: { lineHeight: 28 },
} as const satisfies Partial<Record<TypeStyleName, { lineHeight: number }>>;
