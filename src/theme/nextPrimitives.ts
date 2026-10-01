/**
 * Next color primitives from Figma Foundations
 * (ETEN × Fluent · Foundations · 01 Color primitives).
 * Hex values transcribed from the Foundations page swatches.
 */
export const nextPrimitives = {
  white: '#FFFFFF',
  black: '#000000',
  bone: {
    50: '#EFEFE9',
    100: '#E6E5DD',
    200: '#D2D1CA',
    300: '#BFBEB7',
    400: '#ACABA5',
    500: '#93928D',
    600: '#7B7A76',
    700: '#5E5E5A',
    800: '#40403D',
    900: '#2C2B29',
    950: '#121211',
  },
  blue: {
    50: '#E6EFFE',
    100: '#D7E5FE',
    200: '#B9D2FD',
    300: '#9BBEFC',
    400: '#7DAAFC',
    500: '#538EFB',
    600: '#2A70F4',
    700: '#0B50D0',
    800: '#043692',
    900: '#022468',
    950: '#000E33',
  },
  red: {
    50: '#FEE9E6',
    100: '#FEDBD7',
    200: '#FDBFB8',
    300: '#FDA298',
    400: '#FC8177',
    500: '#FB4744',
    600: '#E11825',
    700: '#AF101A',
    800: '#7A080F',
    900: '#570407',
    950: '#290102',
  },
  /** Opacity stops from Foundations (percent of black/white as noted in Figma). */
  opacity: {
    0: 0,
    8: 0.08,
    12: 0.12,
    16: 0.16,
    24: 0.24,
    32: 0.32,
    40: 0.4,
  },
} as const;

export type NextPrimitiveRamp = typeof nextPrimitives.bone;
