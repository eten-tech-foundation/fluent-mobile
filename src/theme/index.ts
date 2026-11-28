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
export type { WorkflowStageId } from './tokens';

/** Static Next Hardware theme for module-level StyleSheets. */
export { nextTheme as theme, resolveTheme, type Theme } from './next';
export { DEFAULT_COLOR_MODE, type ColorMode } from './colorMode';

// Runtime hooks live in `./useTheme` — import them from there (not this barrel)
// so static `theme` consumers do not pull React context into the module graph.
