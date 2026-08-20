/**
 * Helpers for Expo Router search params (always string | string[]).
 */

export type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

export function parseOptionalBoolean(
  value: SearchParamValue,
): boolean | undefined {
  const raw = first(value);
  if (raw === null || raw === undefined) {
    return undefined;
  }
  if (raw === 'true' || raw === '1') {
    return true;
  }
  if (raw === 'false' || raw === '0') {
    return false;
  }
  return undefined;
}

export function parseOptionalString(
  value: SearchParamValue,
): string | undefined {
  const raw = first(value);
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  return raw;
}

export function parseOptionalNumber(
  value: SearchParamValue,
): number | undefined {
  const raw = first(value);
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRequiredNumber(
  value: SearchParamValue,
  paramName: string,
): number {
  const n = parseOptionalNumber(value);
  if (n === null || n === undefined) {
    throw new Error(`Missing or invalid route param: ${paramName}`);
  }
  return n;
}

export function parseRequiredString(
  value: SearchParamValue,
  paramName: string,
): string {
  const raw = parseOptionalString(value);
  if (raw === null || raw === undefined) {
    throw new Error(`Missing route param: ${paramName}`);
  }
  return raw;
}

/** Serialize boolean query params for hrefs. */
export function boolParam(value: boolean | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value ? 'true' : 'false';
}
