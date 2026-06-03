import { rawRadius } from './tokens';

export const radius = { ...rawRadius } as const;

export type Radius = typeof radius;
