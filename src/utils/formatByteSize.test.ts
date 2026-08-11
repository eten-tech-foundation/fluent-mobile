import {
  formatAvailableDeviceStorage,
  formatByteSize,
  formatStorageCapacity,
} from './formatByteSize';

describe('formatByteSize', () => {
  it('returns 0 B for non-finite or non-positive values', () => {
    expect(formatByteSize(0)).toBe('0 B');
    expect(formatByteSize(-1)).toBe('0 B');
    expect(formatByteSize(Number.NaN)).toBe('0 B');
    expect(formatByteSize(Number.POSITIVE_INFINITY)).toBe('0 B');
  });

  it('formats megabytes for typical download totals', () => {
    expect(formatByteSize(318 * 1024 * 1024)).toBe('318 MB');
  });

  it('keeps one decimal for fractional megabytes (e.g. storage sums)', () => {
    expect(formatByteSize(8.5 * 1024 * 1024)).toBe('8.5 MB');
    expect(formatByteSize(17 * 1024 * 1024)).toBe('17 MB');
    expect(formatByteSize(25.5 * 1024 * 1024)).toBe('25.5 MB');
  });
});

describe('formatStorageCapacity', () => {
  it('formats gigabytes for device storage values', () => {
    expect(formatStorageCapacity(12.4 * 1024 * 1024 * 1024)).toBe('12.4 GB');
    expect(formatStorageCapacity(64 * 1024 * 1024 * 1024)).toBe('64 GB');
  });
});

describe('formatAvailableDeviceStorage', () => {
  it('combines available and total capacity', () => {
    expect(
      formatAvailableDeviceStorage(
        12.4 * 1024 * 1024 * 1024,
        64 * 1024 * 1024 * 1024,
      ),
    ).toBe('12.4 GB of 64 GB');
  });

  it('returns em dash when values are unavailable', () => {
    expect(formatAvailableDeviceStorage(null, null)).toBe('—');
  });
});
