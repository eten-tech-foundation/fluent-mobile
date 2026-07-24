import { ConnectivityProfile } from '../types/db/types';
interface ShouldPresentPrepareOfflineParams {
  connectivityProfile: ConnectivityProfile | null;
  isAssigned: boolean;
  isOnline: boolean;
  isWifi: boolean;
  isCellular: boolean;
  uploadOverCellular: boolean;
}

export function shouldPresentPrepareOffline({
  connectivityProfile,
  isAssigned,
  isOnline,
  isWifi,
  isCellular,
  uploadOverCellular,
}: ShouldPresentPrepareOfflineParams): boolean {
  const eligibleConnection =
    isOnline && (isWifi || (uploadOverCellular && isCellular));
  if (!eligibleConnection) return false;

  const profile = connectivityProfile ?? 'rarely_connected';

  if (profile === 'rarely_connected') return true;
  if (profile === 'sometimes_connected') return !isAssigned;
  return false;
}
