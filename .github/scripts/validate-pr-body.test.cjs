const {
  validatePrBody,
  isExemptAuthor,
  stripCodeRabbitSummary,
  hasRefsIssueLink,
  extractSection,
} = require('./validate-pr-body.cjs');

const FILLED_BODY = `### TLDR

Cross-account takes stay scoped to the active user so shared devices do not leak uploads.

### Reviewer checklist

- [x] GitHub issue linked in Details (\`Refs #NNN\` — do **not** use \`Closes\` / \`Fixes\` / \`Resolves\`)

### Details

Refs #259

Filters queries by the signed-in account.

**Type of change:**

- [x] Bug fix

#### Technical changes

- \`src/db/queries.ts\` — scope pending counts

#### Testing

\`npm test -- --ci\`

### How to verify

1. npm run format:check && npm run lint && npm run typecheck && npm test -- --ci
2. Sign in as user A, record a take, switch to user B — pending counts stay empty for B

**Expected:** User B does not see user A's pending uploads.

### Follow-ups

- None
`;

const EMPTY_TEMPLATE = `### TLDR

<!-- 2–4 sentences: what changed, why, and impact. -->

### Details

Refs #<!-- issue number this PR implements -->

### How to verify

1. <!-- e.g. npm run format:check -->
`;

describe('isExemptAuthor', () => {
  it('exempts Dependabot bot logins', () => {
    expect(isExemptAuthor('dependabot[bot]')).toBe(true);
    expect(isExemptAuthor('Dependabot')).toBe(true);
  });

  it('does not exempt humans', () => {
    expect(isExemptAuthor('B3RN153')).toBe(false);
    expect(isExemptAuthor('mattrace-gloo')).toBe(false);
  });
});

describe('hasRefsIssueLink', () => {
  it('matches Refs #NNN on its own line', () => {
    expect(hasRefsIssueLink('Refs #317\n')).toBe(true);
    expect(hasRefsIssueLink('refs: #12')).toBe(true);
  });

  it('ignores Closes-only bodies', () => {
    expect(hasRefsIssueLink('Closes #317')).toBe(false);
  });
});

describe('extractSection / stripCodeRabbitSummary', () => {
  it('extracts TLDR prose', () => {
    expect(extractSection(FILLED_BODY, 'TLDR')).toMatch(/Cross-account/);
  });

  it('strips CodeRabbit summary blocks', () => {
    const raw = `## Summary by CodeRabbit\n\n* **Bug Fixes**\n  * something\n\n### TLDR\n\nReal author text here for reviewers.\n`;
    expect(stripCodeRabbitSummary(raw)).toMatch(/Real author text/);
    expect(stripCodeRabbitSummary(raw)).not.toMatch(/Bug Fixes/);
  });
});

describe('validatePrBody', () => {
  it('passes a filled template body', () => {
    expect(validatePrBody({ body: FILLED_BODY, author: 'mattrace-gloo' })).toEqual(
      { ok: true },
    );
  });

  it('skips Dependabot authors', () => {
    const result = validatePrBody({ body: '', author: 'dependabot[bot]' });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('fails on empty body', () => {
    const result = validatePrBody({ body: '   ', author: 'B3RN153' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/empty/i);
  });

  it('fails on unfilled template placeholders', () => {
    const result = validatePrBody({ body: EMPTY_TEMPLATE, author: 'B3RN153' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /TLDR/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /Refs/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /How to verify/i.test(e))).toBe(true);
  });

  it('fails on CodeRabbit-only body like PR #306', () => {
    const body = `

## Summary by CodeRabbit

* **Bug Fixes**
  * Upload counts now show only data associated with the active account.

- Deferring team/review mode to #279
`;
    const result = validatePrBody({ body, author: 'B3RN153' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /TLDR|CodeRabbit|Refs|How to verify/i.test(e))).toBe(
      true,
    );
  });
});
