import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { hrefs } from './hrefs';

/**
 * Rendered in place of Legacy Home while the UI version is Next, so every
 * return to home (Settings back, account switch, reauth) lands on v2.
 */
export function V2HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.dismissTo(hrefs.v2Home);
  }, [router]);
  return null;
}
