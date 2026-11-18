import { useWindowDimensions } from 'react-native';
import { useTheme } from '../../../../theme/useTheme';

/** The hero shows this many lines of the script at body size. */
const PREVIEW_LINES = 4;
const PLAYER_FADE_LINES = 2;

/**
 * Sizes for the script as it grows from body size in the hero to reading
 * size in the player. maxFontSizeMultiplier caps the glyphs but Android
 * scales lineHeight by the full font scale, so cap that by hand
 * (figma-to-component.md). The scale is read from the window so a mounted
 * screen follows a system text size change; these values change without the
 * theme, so merge them outside `useThemedStyles` factories.
 */
export function useScriptMetrics() {
  const theme = useTheme();
  const small = theme.type.body;
  const large = theme.type.lead;
  const { fontScale } = useWindowDimensions();
  const capped = Math.min(fontScale, theme.fontScale.readingMax);
  const lineProp = (lineHeight: number) => (lineHeight * capped) / fontScale;
  return {
    small,
    large,
    smallLine: lineProp(small.lineHeight),
    largeLine: lineProp(large.lineHeight),
    preview: PREVIEW_LINES * small.lineHeight * capped,
    // One line deep in the hero; two in the player, so reading eases out
    // well before the waveform.
    fadeSmall: small.lineHeight * capped,
    fadeLarge: PLAYER_FADE_LINES * large.lineHeight * capped,
  };
}
