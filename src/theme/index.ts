import { colors } from './colors';
import { spacing } from './spacing';
import { radius } from './radius';
import { typography } from './typography';

export { colors } from './colors';
export { spacing } from './spacing';
export { radius } from './radius';
export { typography } from './typography';
export {
  hslToHex,
  rawColors,
  rawSpacing,
  rawRadius,
  rawTypography,
} from './tokens';
export { iconSizes, logoSize, headerLayout } from './iconSpecs';

export const theme = {
  colors,
  spacing,
  radius,
  typography,
} as const;

export type Theme = typeof theme;
