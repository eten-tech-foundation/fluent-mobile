export interface AccountDisplayInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

function firstCharacter(value?: string): string {
  return value?.trim().charAt(0).toUpperCase() ?? '';
}

function buildEmailFallback(email?: string): string {
  const trimmedEmail = email?.trim() ?? '';
  if (!trimmedEmail) return 'Unknown account';
  return trimmedEmail;
}

export function getAccountDisplayName({
  firstName,
  lastName,
  email,
}: AccountDisplayInput): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || buildEmailFallback(email);
}

export function getAccountInitials({
  firstName,
  lastName,
  email,
}: AccountDisplayInput): string {
  const nameInitials = `${firstCharacter(firstName)}${firstCharacter(
    lastName,
  )}`;

  if (nameInitials.length > 0) return nameInitials;

  const emailName = email?.split('@')[0] ?? '';
  const emailParts = emailName.split(/[._\s-]+/).filter(Boolean);
  const emailInitials =
    emailParts.length > 1
      ? `${firstCharacter(emailParts[0])}${firstCharacter(emailParts[1])}`
      : emailName.trim().slice(0, 2).toUpperCase();

  return emailInitials || '?';
}
