import type { Passage } from '../../../../hooks/usePassage';

export type Ready = Extract<Passage, { status: 'ready' }>;
