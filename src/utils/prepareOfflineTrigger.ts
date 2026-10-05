import { ConnectivityProfile } from '../types/db/types';
import {
  isEffectivelyOnlineForTransfer,
  type TransferTransportInput,
} from './transportPolicy';

interface ShouldPresentPrepareOfflineParams extends TransferTransportInput {
  connectivityProfile: ConnectivityProfile | null;
  isAssigned: boolean;
  /** @deprecated Kept for call-site compatibility; transport policy uses `connectionType`. */
  isCellular?: boolean;
}

export function shouldPresentPrepareOffline({
  connectivityProfile,
  isAssigned,
  isOnline,
  isWifi,
  uploadOverCellular,
  connectionType,
}: ShouldPresentPrepareOfflineParams): boolean {
  if (
    !isEffectivelyOnlineForTransfer({
      isOnline,
      isWifi,
      uploadOverCellular,
      connectionType,
    })
  ) {
    return false;
  }

  const profile = connectivityProfile ?? 'rarely_connected';

  if (profile === 'rarely_connected') return true;
  if (profile === 'sometimes_connected') return !isAssigned;
  return false;
}
