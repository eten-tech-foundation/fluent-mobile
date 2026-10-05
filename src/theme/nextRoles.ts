import { nextPrimitives } from './nextPrimitives';

const { bone, blue, red, white, black, opacity } = nextPrimitives;

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Semantic color roles from Figma Foundations · 02 Color roles.
 * Three modes: Canvas (dark reading), Hardware (light chrome), Accent (blue overlays).
 * Values resolve to primitives (or transparent / alpha composites).
 */
export type NextColorRoleMode = 'canvas' | 'hardware' | 'accent';

export type NextColorRoles = {
  bgDefault: string;
  bgClear: string;
  surfaceHighlight: string;
  surfaceDefault: string;
  surfaceInverse: string;
  surfaceInverseMuted: string;
  surfaceSunken: string;
  fgPrimary: string;
  fgSecondary: string;
  fgInactive: string;
  fgOnInverse: string;
  fgOnAccent: string;
  borderHighlight: string;
  borderShadow: string;
  borderRim: string;
  shadowCast: string;
  shadowFloat: string;
  shadowEdge: string;
  shadowDish: string;
  accentPrimary: string;
  accentRecord: string;
};

export const nextColorRoles = {
  canvas: {
    bgDefault: black,
    bgClear: withAlpha(black, opacity[0]),
    surfaceHighlight: bone[800],
    surfaceDefault: bone[900],
    surfaceInverse: bone[100],
    surfaceInverseMuted: bone[600],
    surfaceSunken: bone[950],
    fgPrimary: bone[100],
    fgSecondary: bone[400],
    fgInactive: bone[900],
    fgOnInverse: black,
    fgOnAccent: white,
    borderHighlight: bone[800],
    borderShadow: black,
    borderRim: bone[900],
    shadowCast: withAlpha(black, opacity[32]),
    shadowFloat: withAlpha(black, opacity[24]),
    shadowEdge: withAlpha(black, opacity[12]),
    shadowDish: withAlpha(black, opacity[8]),
    accentPrimary: blue[700],
    accentRecord: red[600],
  },
  hardware: {
    bgDefault: bone[50],
    bgClear: withAlpha(bone[50], opacity[0]),
    surfaceHighlight: bone[50],
    surfaceDefault: bone[100],
    surfaceInverse: bone[900],
    surfaceInverseMuted: bone[700],
    surfaceSunken: bone[200],
    fgPrimary: bone[900],
    fgSecondary: bone[700],
    fgInactive: bone[300],
    fgOnInverse: bone[100],
    fgOnAccent: white,
    borderHighlight: white,
    borderShadow: bone[400],
    borderRim: bone[400],
    shadowCast: withAlpha(black, opacity[32]),
    shadowFloat: withAlpha(black, opacity[24]),
    shadowEdge: withAlpha(black, opacity[12]),
    shadowDish: withAlpha(black, opacity[8]),
    accentPrimary: blue[700],
    accentRecord: red[600],
  },
  accent: {
    bgDefault: blue[700],
    bgClear: withAlpha(blue[700], opacity[0]),
    surfaceHighlight: blue[500],
    surfaceDefault: blue[600],
    surfaceInverse: bone[100],
    surfaceInverseMuted: blue[400],
    surfaceSunken: blue[800],
    fgPrimary: white,
    fgSecondary: blue[100],
    fgInactive: blue[600],
    fgOnInverse: blue[900],
    fgOnAccent: blue[800],
    borderHighlight: blue[500],
    borderShadow: blue[900],
    borderRim: blue[400],
    shadowCast: withAlpha(black, opacity[32]),
    shadowFloat: withAlpha(black, opacity[24]),
    shadowEdge: withAlpha(black, opacity[12]),
    shadowDish: withAlpha(black, opacity[8]),
    accentPrimary: bone[100],
    accentRecord: red[600],
  },
} as const satisfies Record<NextColorRoleMode, NextColorRoles>;

/** Default Next chrome mode for app shell (Settings, lists, drawers). */
export const NEXT_DEFAULT_COLOR_MODE: NextColorRoleMode = 'hardware';
