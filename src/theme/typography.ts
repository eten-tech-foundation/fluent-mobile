import { rawTypography } from './tokens';

export const typography = { ...rawTypography } as const;

export type Typography = typeof typography;
