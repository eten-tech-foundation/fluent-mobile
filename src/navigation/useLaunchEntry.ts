import { useEffect, useRef } from 'react';

/**
 * True until a render inside a route group has committed.
 *
 * The launch route `/` only redirects once the session is known, so the group
 * entered from it is not a navigation the user made. Its screen transition
 * would hold saved content behind an entry animation on every cold launch.
 */
export function useLaunchEntry(inRouteGroup: boolean): boolean {
  const leftLaunchRoute = useRef(false);
  useEffect(() => {
    if (inRouteGroup) leftLaunchRoute.current = true;
  }, [inRouteGroup]);
  return !leftLaunchRoute.current;
}
