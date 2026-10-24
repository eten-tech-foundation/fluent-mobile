# Product clarification evidence for Matt —22 October2026

All four exact Slack messages were verified read-only as Chad (`U0B0NT2FTHA`). No Slack message, code/device action, policy drafting or runtime promotion occurred.

## Verse/Pericope selection

[Chad19:23UTC](https://midwestern.slack.com/archives/C0B9RJZ5W75/p1792696980623739): “Settings: Verse/Pericope selection stays on the device and does not follow the user.”

D0407-03’s account-sync expected result is superseded. Settled local toggle/persistence checks D0407-01/02 remain intact. Do not extend this to all preferences or invent a device-global shared-account storage rule. Existing#754/mobilePR760/API434/439 account-sync work now needs owner reconciliation; this document authorizes no rollback or new implementation. The old86 scorecard/unit classification remains frozen pending main-owner reconciliation, not a claim that account-sync is still required.

## Source-Bible playback

[Chad19:26UTC](https://midwestern.slack.com/archives/C0B9RJZ5W75/p1792697160199839) first asks whether this is a source recording, then describes playing a source Bible up to verse3 and selecting verse4: “It needs to keep the current playback position.”

D0595 expectation is source-Bible position preservation for that confirmed context. Existing PR651 history is reused; no recorded-draft-take or unrelated-player behavior is inferred. Real audio/source identity and any required timestamp fixtures remain runtime prerequisites.

## Concrete permissions examples already in audit evidence

[Chad19:14UTC](https://midwestern.slack.com/archives/C0B9RJZ5W75/p1792696483629029): “Maybe I need more context here. Can you give me some examples? My guess is sometimes the answer is hide and sometimes it is to show a message.” No universal presentation decision was made.

| Existing example | What is actually evidenced | Specific context to bring to Product |
| --- | --- | --- |
| Resources403 versus empty content | Existing isolated TN/TQ/Images/PFO tests distinguish resource GET403 from an empty chapter. Historical QA user10/project8/assignment484/1Peter5 showed empty Resources; that was not an observed403 and did not verify org grants. | A verified signed-in identity is refused a particular Resources GET: hide that entry, retain the view with a permission explanation, or another case-specific response? Do not use the empty484 screen as a denial example. |
| Sync403 versus session401 | Existing sync.auth contract evidence distinguishes403 from reauthentication/empty reconciliation. Mobile grant readback is not established; chapter assignment does not establish project/system permissions. | For a verified grant-denied Sync action while a valid session/local content exists, specify the UI response; do not treat it as expired authentication or choose a global hide rule. |
| Denied auto-claim404 | Pinned API policy distinguishes a Project Manager (`content:assign`) from a translator auto-claim path; existing mocked offline-claim contract prevents false local assignment after server denial. This is not current deployed/live-grant proof. | For that exact denied claim/action context, specify the visible explanation/disabled/hidden behavior after the correct actor grant and server response are established. |

Sources: `docs/product-behavior/roles-and-permissions.md` (explicitly pinned/API-doc/inferred labels; live grant allow/deny0), `coverage.json` A0029 and `/tmp/fluent-terms-privacy-freeze-and-gaps.md` (historical session/role-fixture limits). No new live permission failure is claimed. Already specified Observer/read-only and peer-slot restrictions are not reopened.

## Privacy wording for Joel / Mission Mutual legal

[Chad19:32UTC](https://midwestern.slack.com/archives/C0B9RJZ5W75/p1792697520286629) asks to see the finding and says the policy depends on Joel and Mission Mutual lawyers; he supplies no replacement wording.

Existing [mobile#725](https://github.com/eten-tech-foundation/fluent-mobile/issues/725) records this exact contradiction:

> Your data will not be used for model training. OR Your data may be used for model training.

Existing source evidence: mobile branch `mrace/chore/717-build-out-full-maestro-e2e-coverage` at `a4a9c83`, `src/app/tabs/PrivacyPolicyPage.tsx:16-17`; signed-in/out routes re-export that component. Web at `e5fa478b6345505b998d789532b67b827068663a`, `src/features/legal/components/PrivacyPolicyPage.tsx`, contains the same contradiction. This is source-confirmed content evidence, not a fresh deployed-device render claim. Both alternatives are shown with an unresolved OR; approved legal wording is needed, then consistent visible-copy verification. This report chooses neither statement and drafts no policy.

A0006 navigation/body/overflow-scroll PASS remains settled. The wording defect and legal ownership are separate; do not repeat legal-page navigation or scrolling.


## Parent-approved D0407-03 replacement and current-source conflict

The historical positive account-sync requirement is superseded by Chad’s verified device-local decision. The same atomic row now checks unverified absence of account-following Verse/Pericope sync. Denominator86 and64complete/10partial/12notrun remain unchanged. Existing local-persistence PASS is reused, not counted again. Shared-device account scoping is not decided.

At current main `c9e82a905889f4c3cdc9d0916be944b4a3613925`, merged [PR760](https://github.com/eten-tech-foundation/fluent-mobile/pull/760) still schedules displayMode sync: online dirty selection plus valid credentials and both strict capabilities permits PUT; clean concrete remote verse/pericope is imported without that capability gate. This is a current-source/product mismatch; deployment/actual network behavior is unobserved. A narrow displayMode push/pull corrective change is needed; parent must decide implementation before code/public issue action. Generic settings safeguards and other preferences are outside this change. Evidence: `/Users/matt/Documents/Codex/2026-10-19/task-10/artifacts/issue-history-reconciliation-20261022/device-local-preference-current-source-and-pr774-20261022.json`.

[PR774](https://github.com/eten-tech-foundation/fluent-mobile/pull/774), published head `c683b330511beb87031acaeb18d2010bca006235`, is open grant-snapshot prerequisite work for #773/#452. Lane-reported261suites/2332tests passed; CI pending. Observer UI/routing and native acceptance remain unfinished. No runtime promotion.
