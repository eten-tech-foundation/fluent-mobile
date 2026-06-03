import { colors, spacing, radius, typography, workflowBadges } from './tokens';
import { homeListContent, listCard, workflowBadge } from './layout';

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
  progressRingStrokeWidth,
  listIconStrokeWidth,
  touchHitSlop,
} from './iconSpecs';
export { homeListContent, listCard, workflowBadge } from './layout';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  homeListContent,
  listCard,
  workflowBadge,
} as const;

export type Theme = typeof theme;
