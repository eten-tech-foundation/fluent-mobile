export {
  colors,
  spacing,
  radius,
  typography,
  workflowBadges,
  workflowStages,
  recordControlSizes,
  shadows,
  waveform,
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

export { legacyTheme, theme, type Theme } from './legacy';
export {
  DEFAULT_COLOR_MODE,
  DEFAULT_UI_VERSION,
  isUiVersion,
  type ColorMode,
  type UiVersion,
} from './uiVersionTypes';
export { resolveTheme } from './uiVersion';

// Runtime hooks live in `./useTheme` — import them from there (not this barrel)
// so static `theme` consumers do not pull preference/storage into the module graph.
