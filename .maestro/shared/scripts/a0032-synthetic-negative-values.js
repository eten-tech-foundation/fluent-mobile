// A-0032-01: generate unique never-created reserved-domain email + invalid nonsecret test string.
// No real credentials. Password is disposable test data, not a secret to persist.
const nonce =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

output.a0032Email = `qa-neg-${nonce}@example.invalid`;
output.a0032InvalidPassword = 'qa-neg-not-a-password-x7k2';
output.a0032EmailDomainOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
  output.a0032Email,
);
