import { useMemo } from 'react';
import { useTheme } from '../../../theme/useTheme';
import {
  artProgress,
  coverArtSpec,
  pickStyle,
  type CoverArtSpec,
  type CoverColors,
  type CoverPalette,
  type CoverStyle,
} from './generator';

/**
 * A cover's art and ground, on the given palette and the style its group picks.
 * Call inside a canvas `ColorModeScope`, so the grounds are Canvas roles.
 */
export function useCoverArt({
  seed,
  groupSeed,
  palette,
  progress,
  coverStyle,
}: {
  seed: string;
  groupSeed: string;
  palette: CoverPalette;
  /** 0–1: how much is recorded. */
  progress: number;
  /** Overrides the group's style. */
  coverStyle?: CoverStyle;
}): { ground: string; spec: CoverArtSpec } {
  const { roles, cover } = useTheme();
  const style = coverStyle ?? pickStyle(groupSeed);
  const colors: CoverColors = useMemo(
    () =>
      palette === 'night'
        ? {
            ground: roles.surfaceSunken,
            tone: roles.surfaceDefault,
            status: cover.status,
          }
        : {
            ground: roles.surfaceDefault,
            tone: roles.surfaceHighlight,
            status: cover.status,
          },
    [palette, roles, cover],
  );
  const art = artProgress(progress);
  const spec = useMemo(
    () => coverArtSpec({ seed, progress: art, style }, colors),
    [seed, art, style, colors],
  );
  return { ground: colors.ground, spec };
}
