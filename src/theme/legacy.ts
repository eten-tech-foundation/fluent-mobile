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
import { legacyRoles } from './legacyRoles';
import { buildElevation } from './elevation';

/** Frozen Legacy theme — matches today's shipped UI token values. */
export const legacyTheme = {
  colors,
  spacing: { xxs: 2, ...spacing },
  radius: { xs: 4, ...radius },
  typography,
  /** Foundations role names (Next components); Legacy maps to nearest colors. */
  roles: legacyRoles,
  elevation: buildElevation(legacyRoles),
  motion: {
    pressMs: 80,
    releaseMs: 180,
    easeStandard: { x1: 0.2, y1: 0, x2: 0, y2: 1 },
  },
  opacity: { disabled: 0.4 },
  controlSizes: { icon24: 24, icon32: 32 },
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
