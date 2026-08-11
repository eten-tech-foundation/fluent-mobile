/**
 * Validate a GitHub PR body against the fluent-mobile PR template.
 *
 * Required (human + agent PRs):
 *   - ### TLDR with non-placeholder prose
 *   - Refs #NNN (non-closing issue link)
 *   - ### How to verify with at least one real step or an explicit waiver
 *
 * Soft-fails templates that are empty, HTML-comment-only, or CodeRabbit-only.
 *
 * CLI:
 *   node .github/scripts/validate-pr-body.cjs --body-file path.md
 *   node .github/scripts/validate-pr-body.cjs --body "..." [--author login]
 *
 * Env (Actions):
 *   PR_BODY, PR_AUTHOR
 */

'use strict';

const fs = require('fs');

const DEPENDABOT_LOGINS = new Set([
  'dependabot',
  'dependabot[bot]',
  'dependabot-preview[bot]',
]);

/**
 * @param {string | null | undefined} author
 * @returns {boolean}
 */
function isExemptAuthor(author) {
  if (!author || typeof author !== 'string') return false;
  return DEPENDABOT_LOGINS.has(author.trim().toLowerCase());
}

/**
 * Strip HTML comments and normalize newlines.
 * @param {string} text
 * @returns {string}
 */
function stripHtmlComments(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n/g, '\n');
}

/**
 * Remove CodeRabbit auto-summary blocks (common empty-body filler).
 * @param {string} text
 * @returns {string}
 */
function stripCodeRabbitSummary(text) {
  return String(text || '')
    .replace(
      /##\s*Summary by CodeRabbit[\s\S]*?(?=\n##\s|\n###\s|$)/gi,
      '\n',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract markdown section body after a ### heading until the next ###/##.
 * @param {string} text
 * @param {string} headingTitle e.g. "TLDR"
 * @returns {string | null} null if heading missing
 */
function extractSection(text, headingTitle) {
  const escaped = headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^###\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|\\n##\\s|$)`,
    'im',
  );
  const match = String(text || '').match(re);
  return match ? match[1].trim() : null;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasRefsIssueLink(text) {
  return /(?:^|\n)\s*Refs\s*:?\s*#\d+\b/im.test(String(text || ''));
}

/**
 * True when section text is empty or only checklist/placeholder chrome.
 * @param {string} sectionBody
 * @returns {boolean}
 */
function isPlaceholderOrEmpty(sectionBody) {
  const cleaned = stripHtmlComments(sectionBody)
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*$/gm, '')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/^\s*\d+\.\s*$/gm, '')
    .replace(/\*\*Expected:\*\*\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return true;
  // Unfilled template crumbs
  if (/^issue number this PR implements$/i.test(cleaned)) return true;
  return cleaned.length < 12;
}

/**
 * @typedef {{ ok: true, skipped?: boolean, reason?: string } | { ok: false, errors: string[] }} ValidateResult
 */

/**
 * @param {{ body?: string | null, author?: string | null }} input
 * @returns {ValidateResult}
 */
function validatePrBody(input) {
  const author = input?.author ?? null;
  if (isExemptAuthor(author)) {
    return {
      ok: true,
      skipped: true,
      reason: `Exempt author (${author}) — skipping PR description check`,
    };
  }

  const raw = input?.body ?? '';
  const errors = [];

  if (!String(raw).trim()) {
    return {
      ok: false,
      errors: [
        'PR body is empty. Fill `.github/PULL_REQUEST_TEMPLATE.md` (TLDR, Refs #NNN, How to verify).',
      ],
    };
  }

  const withoutBot = stripCodeRabbitSummary(raw);
  const body = stripHtmlComments(withoutBot).trim();

  if (!body) {
    errors.push(
      'PR body has no author content after removing HTML comments / CodeRabbit summary.',
    );
  }

  const tldr = extractSection(raw, 'TLDR');
  if (tldr === null) {
    errors.push('Missing `### TLDR` section.');
  } else if (isPlaceholderOrEmpty(tldr)) {
    errors.push(
      '`### TLDR` is empty or still has template placeholders — write 2–4 sentences.',
    );
  }

  if (!hasRefsIssueLink(raw)) {
    errors.push(
      'Missing `Refs #NNN` on its own line (do not use Closes/Fixes/Resolves).',
    );
  }

  const howToVerify = extractSection(raw, 'How to verify');
  if (howToVerify === null) {
    errors.push('Missing `### How to verify` section.');
  } else if (isPlaceholderOrEmpty(howToVerify)) {
    errors.push(
      '`### How to verify` is empty — add numbered steps or an explicit waiver.',
    );
  }

  // Catch CodeRabbit-only bodies that happen to lack our headings entirely
  const authorOnly = stripHtmlComments(withoutBot).trim();
  if (
    authorOnly.length > 0 &&
    /summary by coderabbit/i.test(raw) &&
    tldr === null &&
    howToVerify === null
  ) {
    errors.push(
      'Body looks CodeRabbit-only. Replace with the team PR template.',
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  return { ok: true };
}

/**
 * @param {string[]} argv
 * @returns {{ body: string, author: string | null }}
 */
function parseCliArgs(argv) {
  let body = process.env.PR_BODY ?? '';
  let author = process.env.PR_AUTHOR ?? null;
  let bodyFile = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--body-file' && argv[i + 1]) {
      bodyFile = argv[i + 1];
      i += 1;
    } else if (arg === '--body' && argv[i + 1]) {
      body = argv[i + 1];
      i += 1;
    } else if (arg === '--author' && argv[i + 1]) {
      author = argv[i + 1];
      i += 1;
    }
  }

  if (bodyFile) {
    body = fs.readFileSync(bodyFile, 'utf8');
  }

  return { body, author };
}

function main(argv = process.argv.slice(2)) {
  const { body, author } = parseCliArgs(argv);
  const result = validatePrBody({ body, author });

  if (result.ok) {
    if (result.skipped) {
      console.log(result.reason);
    } else {
      console.log('PR description check passed.');
    }
    process.exitCode = 0;
    return result;
  }

  console.error('PR description check failed:\n');
  for (const err of result.errors) {
    console.error(`- ${err}`);
  }
  console.error(
    '\nFill `.github/PULL_REQUEST_TEMPLATE.md` (same content as `.cursor/templates/pr-template.md`).',
  );
  process.exitCode = 1;
  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  validatePrBody,
  isExemptAuthor,
  stripHtmlComments,
  stripCodeRabbitSummary,
  extractSection,
  hasRefsIssueLink,
  isPlaceholderOrEmpty,
  parseCliArgs,
  main,
};
