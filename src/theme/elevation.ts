import type { NextColorRoles } from './nextRoles';

/**
 * Foundations effect styles (07 · Tactile) as RN `boxShadow` strings.
 * Built from roles so edge and shadow colors follow the active mode.
 * Parents of raised / floating views need `overflow: 'visible'`.
 */
export function buildElevation(roles: NextColorRoles) {
  return {
    raised: `inset 0px 2px 2px ${roles.borderHighlight}, inset 0px -2px 1px ${roles.borderShadow}, 0px 3px 6px ${roles.shadowCast}`,
    inset: `inset 0px 3px 6px ${roles.shadowCast}, inset 0px 0px 6px ${roles.shadowEdge}, inset 0px -1px 1px ${roles.borderHighlight}`,
    soft: `inset 1px 1px 1px ${roles.borderHighlight}, inset -1px -1px 1px ${roles.borderShadow}, inset 3px 3px 10px ${roles.shadowDish}, inset -3px -3px 10px ${roles.borderHighlight}`,
    floating: `0px 4px 20px ${roles.shadowFloat}`,
  };
}
