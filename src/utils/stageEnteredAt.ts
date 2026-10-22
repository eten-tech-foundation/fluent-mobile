/**
 * Pass through valid ISO-8601 datetimes; null/omitted/invalid → null.
 * Never falls back to activity / updatedAt / submittedTime (fluent-api#457).
 */
export function normalizeStageEnteredAt(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Require an explicit date-time form (Zod `.datetime()` wire shape).
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      trimmed,
    )
  ) {
    return null;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return null;
  }
  return trimmed;
}

/** Milliseconds for a normalized stage-entry timestamp, or null when unknown. */
export function stageEnteredAtMs(
  value: string | null | undefined,
): number | null {
  const normalized = normalizeStageEnteredAt(value ?? null);
  if (normalized === null) {
    return null;
  }
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}
