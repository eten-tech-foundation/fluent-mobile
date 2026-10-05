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
import { headerLayout } from './iconSpecs';

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
  headerLayout,
} as const;

export type Theme = typeof legacyTheme;

/** Static alias of `legacyTheme` — Legacy-pinned for existing module-level StyleSheets. */
export const theme = legacyTheme;
