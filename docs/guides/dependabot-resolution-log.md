# Dependabot resolution log

Records how open Dependabot PRs were resolved in a given branch so the team can close or merge PRs consistently.

## Template (copy for each batch)

### Branch: `<branch-name>` (date)

Resolved: YYYY-MM-DD

| PR | Title / scope | Change applied |
|----|---------------|----------------|
| #___ | | |

**Action:** <!-- closed with comment / merged / deferred to ticket ___ -->

**Verification run:**

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `FLUENT_USER_EMAIL=test@example.com npm test -- --ci`
- [ ] Android `assembleDebug` (CI or local)
- [ ] Android smoke test (if risky)

### Reference

- Process: [dependabot-process.md](./dependabot-process.md)
- Config: `.github/dependabot.yml`
