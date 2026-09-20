import {
  isEffectivelyOnlineForTransfer,
  isTransportBlockedForTransfer,
  isUnmeteredTransport,
  isWaitingWifiForTransfer,
  transportAllowsTransfer,
} from './transportPolicy';

describe('transportAllowsTransfer', () => {
  it('returns offline when the server is unreachable', () => {
    expect(
      transportAllowsTransfer({
        isOnline: false,
        isWifi: true,
        uploadOverCellular: true,
      }),
    ).toBe('offline');
  });

  it('allows Wi-Fi regardless of the cellular toggle', () => {
    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: true,
        uploadOverCellular: false,
        connectionType: 'wifi',
      }),
    ).toBe('ok');
  });

  it('blocks cellular when the toggle is off', () => {
    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: false,
        connectionType: 'cellular',
      }),
    ).toBe('waiting_wifi');
  });

  it('allows cellular when the toggle is on', () => {
    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: true,
        connectionType: 'cellular',
      }),
    ).toBe('ok');
  });

  it('allows ethernet without the cellular toggle (Option A)', () => {
    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: false,
        connectionType: 'ethernet',
      }),
    ).toBe('ok');
  });

  it('treats other non-wifi types as waiting for Wi-Fi unless the toggle is on', () => {
    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: false,
        connectionType: 'other',
      }),
    ).toBe('waiting_wifi');

    expect(
      transportAllowsTransfer({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: true,
        connectionType: 'other',
      }),
    ).toBe('ok');
  });
});

describe('transport policy helpers', () => {
  it('treats wifi and ethernet as unmetered', () => {
    expect(isUnmeteredTransport(true, 'wifi')).toBe(true);
    expect(isUnmeteredTransport(false, 'ethernet')).toBe(true);
    expect(isUnmeteredTransport(false, 'cellular')).toBe(false);
  });

  it('maps gate results onto chrome/action helpers', () => {
    const blocked = {
      isOnline: true,
      isWifi: false,
      uploadOverCellular: false,
      connectionType: 'cellular',
    };
    expect(isEffectivelyOnlineForTransfer(blocked)).toBe(false);
    expect(isTransportBlockedForTransfer(blocked)).toBe(true);

    const allowed = { ...blocked, uploadOverCellular: true };
    expect(isEffectivelyOnlineForTransfer(allowed)).toBe(true);
    expect(isTransportBlockedForTransfer(allowed)).toBe(false);
    expect(isWaitingWifiForTransfer(blocked)).toBe(true);
    expect(isWaitingWifiForTransfer(allowed)).toBe(false);
    expect(
      isWaitingWifiForTransfer({
        isOnline: false,
        isWifi: false,
        uploadOverCellular: false,
      }),
    ).toBe(false);
  });
});
