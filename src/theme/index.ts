import { colors, spacing, radius, typography } from './tokens';

export { colors, spacing, radius, typography, hslToHex } from './tokens';
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
} as const;

export type Theme = typeof theme;
