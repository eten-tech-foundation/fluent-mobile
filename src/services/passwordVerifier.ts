import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';
import { logger } from '../utils/logger';
import {
  getCredentials,
  getPasswordVerifierRecord,
  savePasswordVerifierRecord,
} from './keychain';
import { getKnownUserIds, getUserEmail } from './storage';

const log = logger.create('PasswordVerifier');

/**
 * PBKDF2-HMAC-SHA256 work factor for the stored verifier.
 * Hermes has no JIT. 210k iterations took ~26s jitless on an M-series Mac,
 * which would freeze sign-in. 10k is about a second there and is what we
 * store. Raise this only with a native KDF.
 */
export const PASSWORD_VERIFIER_ITERATIONS = 10_000;
const DERIVED_KEY_BYTES = 32;
const SALT_BYTES = 16;
const FAILURES_BEFORE_LOCKOUT = 5;
const LOCKOUT_BASE_MS = 1000;
const LOCKOUT_MAX_STEPS = 6;

type StoredVerifier = {
  v: 1;
  c: number;
  salt: string;
  hash: string;
};

type FailureState = { count: number; lockedUntil: number };

const failuresByEmail = new Map<string, FailureState>();

export type OfflineRestoreResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: 'no-account' | 'no-verifier' | 'no-token' | 'mismatch' | 'locked';
    };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function lockoutMs(failureCount: number): number {
  if (failureCount < FAILURES_BEFORE_LOCKOUT) return 0;
  const steps = Math.min(
    failureCount - FAILURES_BEFORE_LOCKOUT + 1,
    LOCKOUT_MAX_STEPS,
  );
  return LOCKOUT_BASE_MS * 2 ** (steps - 1);
}

function noteMismatch(emailKey: string): void {
  const prior = failuresByEmail.get(emailKey);
  const count = (prior?.count ?? 0) + 1;
  const delay = lockoutMs(count);
  failuresByEmail.set(emailKey, {
    count,
    lockedUntil: delay > 0 ? Date.now() + delay : 0,
  });
}

/** Test-only. Production lockout state lives for the JS runtime. */
export function resetOfflineSignInAttempts(): void {
  failuresByEmail.clear();
}

export function findDeviceUserIdByEmail(email: string): string | null {
  const want = normalizeEmail(email);
  if (!want) return null;
  for (const userId of getKnownUserIds()) {
    if (normalizeEmail(getUserEmail(userId)) === want) return userId;
  }
  return null;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, password, salt, {
    c: iterations,
    dkLen: DERIVED_KEY_BYTES,
    asyncTick: 10,
  });
}

function parseRecord(raw: string | null): StoredVerifier | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredVerifier;
    if (
      parsed?.v !== 1 ||
      !Number.isInteger(parsed.c) ||
      parsed.c < 1 ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.hash !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Stores a salted verifier for this account. Never stores the password.
 * Called after a successful online sign-in. A failure must not undo that sign-in.
 */
export async function savePasswordVerifier(
  userId: string,
  password: string,
  options?: { iterations?: number },
): Promise<void> {
  const iterations = options?.iterations ?? PASSWORD_VERIFIER_ITERATIONS;
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, iterations);
  const record: StoredVerifier = {
    v: 1,
    c: iterations,
    salt: bytesToHex(salt),
    hash: bytesToHex(hash),
  };
  await savePasswordVerifierRecord(userId, JSON.stringify(record));
}

/**
 * Confirms a password against the verifier saved at the last online sign-in.
 * Does not touch the reauth flag or the server session.
 */
export async function restoreOfflineSession(
  email: string,
  password: string,
): Promise<OfflineRestoreResult> {
  const emailKey = normalizeEmail(email);
  const failure = failuresByEmail.get(emailKey);
  if (failure && failure.lockedUntil > Date.now()) {
    return { ok: false, reason: 'locked' };
  }

  const userId = findDeviceUserIdByEmail(email);
  if (!userId) return { ok: false, reason: 'no-account' };

  const credentials = await getCredentials(userId);
  if (!credentials?.token) return { ok: false, reason: 'no-token' };

  const record = parseRecord(await getPasswordVerifierRecord(userId));
  if (!record) return { ok: false, reason: 'no-verifier' };

  let derived: Uint8Array;
  try {
    derived = await derive(password, hexToBytes(record.salt), record.c);
  } catch (error) {
    log.warn('Password verifier could not be checked', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: 'no-verifier' };
  }

  if (!sameBytes(derived, hexToBytes(record.hash))) {
    noteMismatch(emailKey);
    return { ok: false, reason: 'mismatch' };
  }

  failuresByEmail.delete(emailKey);
  return { ok: true, userId };
}
