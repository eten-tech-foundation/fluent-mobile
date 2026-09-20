export type TransportGate = 'ok' | 'offline' | 'waiting_wifi';

export type TransferTransportInput = {
  isOnline: boolean;
  isWifi: boolean;
  uploadOverCellular: boolean;
  /** NetInfo `type` — used so ethernet can be unmetered without the cellular toggle. */
  connectionType?: string;
};

export function isUnmeteredTransport(
  isWifi: boolean,
  connectionType?: string,
): boolean {
  return isWifi || connectionType === 'ethernet';
}

export function transportAllowsTransfer(
  input: TransferTransportInput,
): TransportGate {
  if (!input.isOnline) {
    return 'offline';
  }
  if (
    isUnmeteredTransport(input.isWifi, input.connectionType) ||
    input.uploadOverCellular
  ) {
    return 'ok';
  }
  return 'waiting_wifi';
}

export function isEffectivelyOnlineForTransfer(
  input: TransferTransportInput,
): boolean {
  return transportAllowsTransfer(input) === 'ok';
}

export function isTransportBlockedForTransfer(
  input: TransferTransportInput,
): boolean {
  return transportAllowsTransfer(input) !== 'ok';
}

/** Sync Now UI only — offline disable stays #545. */
export function isWaitingWifiForTransfer(
  input: TransferTransportInput,
): boolean {
  return transportAllowsTransfer(input) === 'waiting_wifi';
}
