// Cached-switch drawer a11y selectors — Maestro runScript (plain JS).
// Installed engine (2.10.0): complex concat/regex via inline evalScript leaves
// output.* undefined; external runScript exports primitive strings reliably.
// Reads already-normalized output.account{A,B,C}Email; fail-closed on bad input.
// Oracle: anchored ^Switch to EMAIL$ (UserSettingsMenu accessibilityLabel).

function escapeRegexLiteral(s) {
  // Equivalent metachar set to classic reEscape; $ kept away from { (no `${`).
  return String(s).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function switchToSelector(email) {
  if (typeof email !== 'string' || email.length === 0) {
    return '';
  }
  return '^Switch to ' + escapeRegexLiteral(email) + '$';
}

output.switchToARe = switchToSelector(output.accountAEmail);
output.switchToBRe = switchToSelector(output.accountBEmail);
output.switchToCRe = switchToSelector(output.accountCEmail);
