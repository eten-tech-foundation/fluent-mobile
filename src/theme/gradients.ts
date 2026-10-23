import type { NextColorRoles } from './nextRoles';

/**
 * Foundations fades as RN `experimental_backgroundImage` strings. Built from
 * roles like `elevation`, so they follow the active mode. `reading` lays over
 * text that's still to come (Figma `fade/reading`: bg/clear to bg/default).
 */
export function buildFades(roles: NextColorRoles) {
  return {
    reading: `linear-gradient(to bottom, ${roles.bgClear}, ${roles.bgDefault})`,
  };
}
