import type { UiVersion } from '../theme/uiVersionTypes';
import { APP_HOME_HREF } from './authGate';
import { hrefs } from './hrefs';

/** Home for the active UI version: v2 for Next, the Legacy stack otherwise. */
export function homeHrefFor(
  uiVersion: UiVersion,
): typeof hrefs.v2Home | typeof APP_HOME_HREF {
  return uiVersion === 'next' ? hrefs.v2Home : APP_HOME_HREF;
}
