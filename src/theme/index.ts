import {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
} from './tokens';
import { homeListContent, listCard, workflowBadge } from './layout';

export {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
  hslToHex,
} from './tokens';
export type { WorkflowStageId } from './tokens';
export {
  iconSizes,
  logoSize,
  headerLayout,
  progressRingStrokeWidth,
  phaseIconStrokeWidth,
  listIconStrokeWidth,
  lucideStrokeWidth,
  touchHitSlop,
  syncStatusIcon,
} from './iconSpecs';
export { homeListContent, listCard, workflowBadge } from './layout';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
  homeListContent,
  listCard,
  workflowBadge,
} as const;

export type Theme = typeof theme;
