# Fixture capabilities and source limits (#717)

This note distinguishes supported fixture paths from source or deployed-UI limitations. It adds no live requirement PASS. The pinned [source evidence](evidence/fixture-source-capabilities.json) records the inspected web/API commits and source receipts; local source may differ from deployed QA.

## Legal links

The web repository has real `/legal/privacy` and `/legal/terms` routes with substantive short documents (`PrivacyPolicyPage.tsx` and `TermsOfUsePage.tsx`). Mobile mirrors that short content. A missing-link failure or replacement blank legal page is not justified by this source. Current deployed rendering and overflow are separate checks; do not force overflow by changing viewport/font settings or authoring new legal content.

The Privacy Policy source nevertheless contains mutually exclusive model-training alternatives joined by an unresolved “OR” in both mobile and web. [Issue #725](https://github.com/eten-tech-foundation/fluent-mobile/issues/725) records this concrete copy defect. Existing #92 explicitly assigns legal wording to product/legal. An approved wording decision is required before replacement; this source finding does not establish a fresh deployed-render failure.

## What pericope seed means

Project membership, the selected pericope set and ordinary project data come from the server. Mobile additionally bundles FIA/FCBH pericope JSON and date/version markers as bootstrap data. The loader hydrates the selected set/book into local SQLite; when a bundled set/book is absent, sync can fetch it through `FluentAPI.getPericopeSet`.

Thus server database data and bundled bootstrap data both exist. Source presence is not proof of an installed release APK. APK provenance is deferred by the user and is not a release gate for this audit. The inspected contract has version markers; do not invent runtime hash-validation or corrupt-seed rejection behavior.

## Populated Resources

Local web source exposes upstream Aquifer readers for Translation Notes, Translation Questions and Images & Maps. No supported per-project authoring/import UI was found. Creating a disposable project does not itself create arbitrary notes or image markers.

A repeatable populated fixture needs an actually observed resource ID, title/body marker, scripture and ISO language from a supported reader. The locally described translation route depends on project/assignment state; do not guess a bare route or treat project12 as a book ID. The deployed QA read-only `/view/60/1` page currently displays source/target columns and audio controls, without Resources controls in its accessible UI; that observation is not populated Resources proof.

## Multiple recording authors

API source binds recording authorship to the authenticated user. Local web source has no verse-audio recording/upload control, so do not invent a PM web uploader or write directly to the API.

A manager with an existing applicable `content:assign` grant may create/upload audio at `community_review` (shown as Community Check), `linguist_check`, `theological_check` or `consultant_check`, subject to the actual API policy and mobile state. This is conditional source analysis, not verified identity, current grant or runtime acceptance. Draft/peer-check/Complete restrictions remain relevant. Saving with no assigned drafter may attempt an auto-claim that is rejected after take persistence; do not force a claim.

Both exact project12 membership approvals and pairing on1183 have been received. The earlier user10 retry was reported clicked once, but its durable project role is unverified: current background Team accessibility includes qa-t1, while no saved-team/server200 proof was retained. Read current qa-t1 role and ordinary project-user response before any save retry. Translator2 is observed as id11/qa-t2 with existing Translator grants; its full exact email is clipped and still needs verification. No translator2 save or pairing has occurred;1183 remains unassigned. The web Assign control requires two project translators. Foreground input stopped after a guard failure; do not work around it or blindly retry a save. Recording waits for a verified disposable assignment.
