import { normalizeStageEnteredAt, stageEnteredAtMs } from './stageEnteredAt';

describe('normalizeStageEnteredAt', () => {
  it('passes through valid ISO-8601 datetimes', () => {
    expect(normalizeStageEnteredAt('2025-04-01T15:30:00.000Z')).toBe(
      '2025-04-01T15:30:00.000Z',
    );
    expect(normalizeStageEnteredAt('2025-04-01T15:30:00+00:00')).toBe(
      '2025-04-01T15:30:00+00:00',
    );
  });

  it('returns null for omitted, blank, or invalid values', () => {
    expect(normalizeStageEnteredAt(undefined)).toBeNull();
    expect(normalizeStageEnteredAt(null)).toBeNull();
    expect(normalizeStageEnteredAt('')).toBeNull();
    expect(normalizeStageEnteredAt('   ')).toBeNull();
    expect(normalizeStageEnteredAt('yesterday')).toBeNull();
    expect(normalizeStageEnteredAt('2025-04-01')).toBeNull();
  });
});

describe('stageEnteredAtMs', () => {
  it('parses normalized timestamps and rejects invalid input', () => {
    expect(stageEnteredAtMs('2025-04-01T15:30:00.000Z')).toBe(
      Date.parse('2025-04-01T15:30:00.000Z'),
    );
    expect(stageEnteredAtMs('not-iso')).toBeNull();
  });
});
