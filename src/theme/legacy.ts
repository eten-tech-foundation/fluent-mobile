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
import { buildFades } from './gradients';
import { nextPrimitives } from './nextPrimitives';
import {
  buildTypeStyles,
  systemFontFamilies,
  teluguTypeOverrides,
} from './typeStyles';

/** Frozen Legacy theme — matches today's shipped UI token values. */
export const legacyTheme = {
  colors,
  spacing: { xxs: 2, ...spacing },
  radius: { xs: 4, ...radius },
  typography,
  /** Foundations role names (Next components); Legacy maps to nearest colors. */
  roles: legacyRoles,
  elevation: buildElevation(legacyRoles),
  /** Figma `fade/*` gradients, built from roles. */
  fade: buildFades(legacyRoles),
  /**
   * Passage cover art. `status` is Foundations blue 900 to 500, how blue a
   * cover gets as it's recorded; no Legacy screen draws covers.
   */
  cover: {
    status: [
      nextPrimitives.blue[900],
      nextPrimitives.blue[800],
      nextPrimitives.blue[700],
      nextPrimitives.blue[600],
      nextPrimitives.blue[500],
    ],
  },
  motion: {
    pressMs: 80,
    releaseMs: 180,
    easeStandard: { x1: 0.2, y1: 0, x2: 0, y2: 1 },
  },
  opacity: { disabled: 0.4 },
  controlSizes: { icon20: 20, icon24: 24, icon32: 32 },
  /** Figma `stroke/1` (rims on screen buttons), `stroke/2` (hardware bevels). */
  stroke: { 1: 1, 2: 2 },
  /** Figma named type styles; no Legacy screen uses them, so same metrics. */
  type: buildTypeStyles(systemFontFamilies.sans, systemFontFamilies.mono),
  typeTelugu: teluguTypeOverrides,
  fontScale: { readingMax: 1.3 },
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
