'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, 'a0032-synthetic-negative-values.js');
const source = fs.readFileSync(file, 'utf8');
const output = {};
vm.runInNewContext(source, {
  output,
  crypto: require('node:crypto'),
  Date,
  Math,
});

assert.match(output.a0032Email, /^qa-neg-.+@example\.invalid$/);
assert.equal(output.a0032EmailDomainOk, true);
assert.match(output.a0032InvalidPassword, /^qa-neg-not-a-password-/);
assert.doesNotMatch(output.a0032Email, /@(fluent\.|eten\.|gloo)/i);
console.log(
  JSON.stringify({
    ok: true,
    emailHost: output.a0032Email.split('@')[1],
    passwordIsTestLiteral: true,
  }),
);
