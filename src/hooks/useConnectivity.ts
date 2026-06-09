import { useEffect, useState } from 'react';
import { subscribeToConnectivity } from '../services/connectivity';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => subscribeToConnectivity(setIsOnline), []);

  return { isOnline };
}
