export function pickLastActivityIso(
  ...timestamps: (string | null | undefined)[]
): string | undefined {
  let latest: string | undefined;

  for (const value of timestamps) {
    if (!value?.trim()) {
      continue;
    }
    if (!latest || new Date(value).getTime() > new Date(latest).getTime()) {
      latest = value;
    }
  }

  return latest;
}

export function formatLastActivity(isoTimestamp?: string): string | undefined {
  if (!isoTimestamp?.trim()) {
    return undefined;
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
