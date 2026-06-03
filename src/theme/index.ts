import { colors, spacing, radius, typography, workflowBadges } from './tokens';

export {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  hslToHex,
} from './tokens';
export {
  iconSizes,
  logoSize,
  headerLayout,
  lucideStrokeWidth,
  touchHitSlop,
} from './iconSpecs';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
} as const;

export type Theme = typeof theme;
