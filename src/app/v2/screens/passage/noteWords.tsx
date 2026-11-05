import React, { useMemo, useState } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Word } from '../../../../components/ui/Word';
import { useTheme } from '../../../../theme/useTheme';
import { verseWords, type NoteChips } from './noteMatch';
import { useScriptMetrics } from './scriptMetrics';

/** The passage's translation notes, as the script shows them. */
export interface ScriptNotes {
  /** Phrases with a note, by verse. */
  chips: NoteChips;
  /** Each note's quote, by note index, for TalkBack. */
  quotes: string[];
  /** The note last opened: its phrase stays full blue; the rest rest quiet. */
  current: number | null;
  /** Notes whose phrase isn't in this text; they follow the placed ones. */
  unplaced: number;
  /** Those notes' indexes by the verse key they're about, "" for none. */
  unplacedAt: Map<string, number[]>;
  /** Opens a note by index, from where it was tapped. Unset, chips are inert. */
  onOpen?: (note: number, from?: { x: number; y: number }) => void;
  /** Record: the outlines go quiet, since notes open from Listen. */
  dimmed?: boolean;
}

/** The "more notes" button: "+34" beside its icon, spelled out for TalkBack. */
export function moreNotesLabels(count: number) {
  return {
    label: `+${count}`,
    spoken: `${count} more translation ${count === 1 ? 'note' : 'notes'}`,
  };
}

/** Atkinson Hyperlegible Next's descent in a chip's line, as a share of its size. */
export const CHIP_DESCENT = 0.2;

/** How Android lays an inline view into a line of text. */
const INLINE = '￼';

export type Segment =
  | { note: null; text: string }
  | { note: number; text: string; words: string[] };

/** A verse's text split into plain runs and the phrases with a note. */
export function segments(
  text: string,
  spans: { start: number; end: number; note: number }[] | undefined,
): Segment[] {
  const words = verseWords(text);
  if (!spans?.length) return [{ note: null, text: words.join(' ') }];
  const out: Segment[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start > at) {
      out.push({ note: null, text: words.slice(at, span.start).join(' ') });
    }
    const phrase = words.slice(span.start, span.end);
    out.push({ note: span.note, text: phrase.join(' '), words: phrase });
    at = span.end;
  }
  if (at < words.length) {
    out.push({ note: null, text: words.slice(at).join(' ') });
  }
  return out;
}

/**
 * Chips at the open player's size: a space/8 shorter than the line (Figma
 * Word has a space/4, too tight for Atkinson's descenders), less their
 * border, dropped by the descent since Android sits an inline view's bottom
 * on the baseline.
 */
export function useChipStyle() {
  const theme = useTheme();
  const { large, largeLine } = useScriptMetrics();
  return useMemo(
    () => ({
      text: {
        fontSize: large.fontSize,
        lineHeight: largeLine - theme.spacing.xs / 2 - 2 * theme.stroke[2],
      },
      box: { transform: [{ translateY: CHIP_DESCENT * large.fontSize }] },
    }),
    [large.fontSize, largeLine, theme],
  );
}

/** Each chip's id, in the order its placeholder sits in the text. */
export function chipIds(segs: Segment[]): string[] {
  const ids: string[] = [];
  for (const seg of segs) {
    if (seg.note !== null) {
      seg.words.forEach((_, j) => ids.push(`${seg.note}-${j}`));
    }
  }
  return ids;
}

/**
 * A phrase's words square off where they meet on a line and stay round
 * where it wraps. Each inline view is one placeholder character in its line,
 * so the lines say which words share one; only a change re-renders. `order`
 * lists every inline view; ids starting with "v" (verse numbers) aren't chips.
 */
export function useChipJoins(order: string[], active: boolean) {
  const [joined, setJoined] = useState<ReadonlySet<string>>(() => new Set());
  const onLines = (lines: { text: string }[]) => {
    if (!active) return;
    const lineOf = new Map<string, number>();
    let at = 0;
    lines.forEach((line, row) => {
      const count = line.text.split(INLINE).length - 1;
      for (let k = 0; k < count && at < order.length; k += 1) {
        lineOf.set(order[at], row);
        at += 1;
      }
    });
    const next = new Set<string>();
    for (const [id, row] of lineOf) {
      if (id.startsWith('v')) continue;
      const [note, word] = id.split('-').map(Number);
      if (lineOf.get(`${note}-${word + 1}`) === row) next.add(id);
    }
    setJoined(prev =>
      prev.size === next.size && [...next].every(k => prev.has(k))
        ? prev
        : next,
    );
  };
  return { joined, onLines };
}

/** A verse's runs, with each noted phrase as Word chips that open it. */
export function noteWords({
  segs,
  keyPrefix,
  notes,
  joined,
  chip,
  maxFontSizeMultiplier,
  testIDPrefix,
}: {
  segs: Segment[];
  keyPrefix: string;
  notes: ScriptNotes | undefined;
  joined: ReadonlySet<string>;
  chip: {
    text: StyleProp<TextStyle>;
    box: StyleProp<ViewStyle>;
  };
  maxFontSizeMultiplier: number;
  testIDPrefix: string;
}): React.ReactNode[] {
  return segs.map((seg, i) =>
    seg.note === null ? (
      `${seg.text} `
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>
        {/* Words of one phrase touch, so the chip reads as one band and
            still wraps between words. */}
        {seg.words.map((w, j) => (
          <Word
            key={j}
            word={w}
            variant={notes?.current === seg.note ? 'phrase' : 'note'}
            dimmed={notes?.dimmed}
            textStyle={chip.text}
            boxStyle={chip.box}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            onPress={
              notes?.onOpen
                ? e =>
                    notes.onOpen?.(
                      seg.note,
                      e?.nativeEvent && {
                        x: e.nativeEvent.pageX,
                        y: e.nativeEvent.pageY,
                      },
                    )
                : undefined
            }
            accessibilityLabel={`Translation note: ${
              notes?.quotes[seg.note] ?? seg.text
            }`}
            hiddenFromAccessibility={j > 0}
            joinStart={joined.has(`${seg.note}-${j - 1}`)}
            joinEnd={joined.has(`${seg.note}-${j}`)}
            testID={`${testIDPrefix}-${seg.note}-${j}`}
          />
        ))}{' '}
      </React.Fragment>
    ),
  );
}
