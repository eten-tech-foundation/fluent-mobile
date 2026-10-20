# Maestro / QA web–mobile role parity (bounded addendum)

**Status:** evidence checkpoint (docs-only). **Not** Nightly signoff. **Not**
full `orgGrants` / server allow-deny proof. **Not** a replacement for the
frozen issue-history packet or the existing visual audit PDF.

This folder is a **separate role-QA addendum** until the report owner updates
the existing visual report (`task-11/output/pdf/fluent-mobile-audit-visual-report.pdf`,
v2 Library receipt). Do **not** treat these files as a duplicate audit/PDF.

## Evidence hierarchy (normative for classification)

| Priority | Source | Use |
| ---: | --- | --- |
| **1 — Mobile intent** | Fluent Mobile GitHub **issues**, **comments**, later **decisions**, and implementing **PRs** | Reconstruct **intended mobile** behavior. This is the specification for defect vs expected. |
| **2 — Mobile runtime** | Preserved mobile terminal receipts (PM / Observer); local membership / UI | What mobile actually showed under the QA session. |
| **3 — API contract pin** | fluent-api @ `4336602…` (permissions / `/self` / project users) | Server membership and role **contracts** — not live deny proof by itself. |
| **4 — Web (supporting only)** | QA web read-only UI + web source checkout | **Comparison evidence** (e.g. Project Team role labels, whether a principal has membership). **Never** a one-to-one mobile specification. |

**Hard rule:** Web-only controls, routes, dashboards, or admin chrome — and
intentional mobile↔web platform differences — are **not** mobile defects.
Classify those as **web-supporting**, **intentional platform**, or **open
mobile ticket** (when a mobile issue already tracks the gap), never as “mobile
should match web.”

## Pins / HEAD

| Lane | Value |
| --- | --- |
| Mobile branch | `mrace/chore/717-build-out-full-maestro-e2e-coverage` |
| Mobile HEAD (docs authored) | `c9d400b4ddab5e64a1ccf798ac4f46c5c305ed8e` |
| API contract pin | `4336602df77ce86a4d46dfd45a7840cc3c64ebc0` |
| Web local checkout (supporting) | `e5fa478b6345505b998d789532b67b827068663a` |
| QA web host | `https://qa.app.fluent.bible/` (deployed UI ≠ source checkout proof) |
| QA API host | `https://qa.api.fluent.bible` |

Source pin / local checkout **≠** deployed QA version proof.

## Evidence inputs (reproduce)

| Artifact | Role in hierarchy |
| --- | --- |
| Mobile issues/PRs cited below (#452/#505/#508/#722/#104/#675, …) | **Mobile intent** |
| `/tmp/fluent-pm-qa-final.md` | Mobile runtime — PM user9 |
| `/tmp/fluent-observer-qa-final.md` | Mobile runtime — Observer user12 |
| `/tmp/fluent-web-parity-source-review.md` | Supporting source expectations (mobile-primary wording) |
| `/tmp/fluent-grant-readback-options.md` | Supported grant readback routes (no re-run) |
| `/tmp/fluent-web-parity-observations.md` | **Web-supporting** root Chrome UI (2026-10-20 ~02:50–02:56 UTC) |
| [`observations.json`](./observations.json) | Machine-readable twin of this checkpoint |

Emails / profile handles cross-link previously verified identities to Project
Team rows only. Email domain ≠ grant.

## Project-specific role proof (web-supporting)

On **QA web**, PM profile, **Project Team** for project **11** (read-only; no
role mutations) displayed:

| Handle | Displayed project-11 role | Maps to mobile userId (receipt) |
| --- | --- | --- |
| qa-obs | Observer | 12 |
| qa-pm | Project Manager | 9 |
| qa-t1 | Translator | 10 |

**Proves (supporting):** project-scoped **roleName** labels on project **11**
for the three parity principals — useful when interpreting mobile membership /
empty My Work under those **labels**.

**Does not prove:** complete `orgGrants[]`, SuperAdmin, permission bitsets, live
HTTP allow/deny, or that mobile UI must mirror web Project Team / admin chrome.

## Membership / My Work (three labels)

Mobile columns are authoritative for mobile runtime. Web columns are supporting.

| Label | userId | Mobile (receipt) — primary | Web (supporting) | Classification |
| --- | ---: | --- | --- | --- |
| Translator | 10 | Membership **1 / 8 / 11**; **9** unique `my-work-row-*` | Same three projects named; dashboard My Work count **18** | Mobile membership consistent with translator label + slots. **Web 18 vs mobile 9** = **UNPROVEN** count delta (live vs local / merge / peer) — **not** a mobile bug claim |
| PM | 9 | Membership **11**; My Work empty; no claim/record UI | TTS only; Project Team + **web-only** admin chrome; `/view/…` readonly | Mobile empty My Work + no claim **aligns** with fixture/slot + mobile intent (PM claim denied). Web admin controls ≠ mobile defect |
| Observer | 12 | Membership **11**; My Work empty; no mutation UI | Observer Dashboard (**web-only**); TTS; `/view/…` plain text | Mobile empty My Work **aligns** with no chapter slot. Dedicated Observer mobile UX remains open **mobile** tickets (#452/#505/#508) — **not** “match web dashboard” |

Do **not** claim identical chapter fixtures across roles (web PM opened a
different first visible row than translator).

## Delta classification

| Observation | Class |
| --- | --- |
| Project 11 team role labels (qa-obs / qa-pm / qa-t1) | **Proven** web-supporting project role display |
| Full orgGrants / server denials | **UNPROVEN** |
| PM/Observer empty **mobile** My Work | **Fixture / assignment-slot** — not a mobile defect by itself |
| Web Observer dashboard, Project Team admin, Create Project, Export, etc. | **Web-only / intentional platform** — **not** mobile defects |
| Mobile generic Home tabs vs web role home | **Intentional platform** (mobile intent from issues/PRs; web is comparison only) |
| Web My Work 18 vs mobile unique 9 | **UNPROVEN** cross-surface count delta — **no mobile (or product) bug asserted** |
| Populated Resources content | **UNPROVEN** |
| Sync / Resources / Record chrome by grant | Open **mobile** product decision [#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722) |
| Mobile `/self/projects` for all roles vs web manager `GET /projects` | **Intentional platform** ([#675](https://github.com/eten-tech-foundation/fluent-mobile/issues/675) mobile path) — not a defect that mobile “should” use web’s branch |

## Existing mobile tickets (no new issues)

| Issue | Role |
| --- | --- |
| [#452](https://github.com/eten-tech-foundation/fluent-mobile/issues/452) | Mobile Observer read-only draft — open; empty My Work ≠ done |
| [#505](https://github.com/eten-tech-foundation/fluent-mobile/issues/505) | Mobile My Work stage accordions + Observer chapters — open |
| [#508](https://github.com/eten-tech-foundation/fluent-mobile/issues/508) | Mobile Observer offline draft download — open |
| [#722](https://github.com/eten-tech-foundation/fluent-mobile/issues/722) | Mobile grant chrome vs denied UX decision — open |
| [#104](https://github.com/eten-tech-foundation/fluent-mobile/issues/104) | Closed — mobile My Work / `user_projects` filtering |
| [#675](https://github.com/eten-tech-foundation/fluent-mobile/issues/675) | Closed — mobile `/self` membership sync |

## Explicit non-claims

- Not Nightly / human device QA signoff
- Not complete grant inventory or live 403 matrix
- Web is **not** the mobile spec; web-only UI ≠ mobile defect
- No credentials, tokens, or translation content excerpts
- Frozen `docs/assessments/issue-history-reconciliation/**` untouched
- No new visual PDF from this addendum (owner updates existing PDF later)
