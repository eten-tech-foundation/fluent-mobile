import { rawSpacing } from './tokens';

export const spacing = { ...rawSpacing } as const;

export type Spacing = typeof spacing;
