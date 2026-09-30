import {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
  recordControlSizes,
  shadows,
  waveform,
} from './tokens';
import { homeListContent, listCard, workflowBadge } from './layout';

/** Frozen Legacy theme — matches today's shipped UI token values. */
export const legacyTheme = {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
  recordControlSizes,
  shadows,
  waveform,
  homeListContent,
  listCard,
  workflowBadge,
} as const;

export type Theme = typeof legacyTheme;

/** Static alias of `legacyTheme` — Legacy-pinned for existing module-level StyleSheets. */
export const theme = legacyTheme;
