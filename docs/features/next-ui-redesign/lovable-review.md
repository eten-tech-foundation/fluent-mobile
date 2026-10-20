# Lovable review: original evidence and current ownership

This preserves the existing **2026-10-20 bounded source review**, not a new
visual audit. The original review did not render the reference or compare
Android screenshots. Public HTML/CSS availability and matching tokens are not
visual acceptance. [#738](https://github.com/eten-tech-foundation/fluent-mobile/issues/738)
owns the remaining comparison and this document's maintenance.

## Original artifacts

| Durable artifact | What it establishes |
| --- | --- |
| [Original source review](lovable-review/original-source-review.md) | Original relevant review text, retained verbatim after its preliminary progress narration; historical findings A–E and proposed batches |
| [Provenance](lovable-review/provenance.json) | Original input hashes, retained text hash, dated execution/model receipt fields, and exact publication transformations |
| [Page/state inventory](lovable-review/page-state-inventory.json) | Existing source-only route, page, modal and state inventory; screenshots and fidelity explicitly unverified |
| [Reference asset receipt](lovable-review/reference-asset-receipt.json) | Public reference HTML/CSS HTTP200 and hashes; `visual_render_verified:false` |

Original reference: [fluent-test1.lovable.app](https://fluent-test1.lovable.app/).
The review read its stylesheet declarations, not its rendered routes or JS
behavior. Repository commits `4727043` and `d12434c` establish historical
reference lineage; they do not establish that today's hosted reference is the
same version. Pin that version before comparison.

The original result was recorded at 07:10 UTC on 2026-10-20. Local artifacts
were named `fluent-opus-visual-audit-result.json`,
`fluent-lovable-reference-asset-receipt.json`, and
`fluent-visual-page-state-inventory.json`. These durable copies replace a
reliance on workstation `/tmp` paths. Raw model/tool envelopes and incidental
execution context are not published. The relevant review body is preserved;
its original assertions are historical, not retroactively rewritten as fixes.

The workspace `output/pdf/fluent-mobile-audit-visual-report.pdf` is a later
composite audit report whose contents changed across versions. It is **not**
the original source-review artifact. No PDF is republished or labeled as an
original here; this PR preserves the original textual review and evidence.

## Finding-to-issue and implementation map

| Original finding / remaining obligation | Tracking and current evidence boundary |
| --- | --- |
| A: shared consumers pinned to Legacy despite runtime Next selection | [#724](https://github.com/eten-tech-foundation/fluent-mobile/issues/724). Local reviewed checkpoints below migrate shared consumers and isolate token objects; no rendered fidelity follows. |
| B: mostly unused `appStyles` keys | [#739](https://github.com/eten-tech-foundation/fluent-mobile/issues/739) / [draft PR #743](https://github.com/eten-tech-foundation/fluent-mobile/pull/743), checkpoint `d84fbe5`. Fresh-main TypeScript AST reference analysis found 105 keys: 7 live keys retained with unchanged initializers, 98 unused keys removed. This is source hygiene, not rendered fidelity; the original historical review below remains unchanged. |
| B/E: identical AccountSwitcherPanel overlay literal | Already included in #724 checkpoint `0566f4c`; do not repeat it in #739. |
| C: competing sync/status and workflow color families | #738 comparison/decision checklist; no canonical visual family inferred solely from CSS declarations. No palette change implemented by this document. |
| D: list-card radius/comment and record-timer comment/value disagreement | #738 reference validation and decision; rendered classes unknown, so no confirmed visual FAIL. |
| E: disabled/pressed opacity and remaining literal/style inconsistencies | #738 reference/decision checklist; retained live values are not silently normalized by #739. |
| Font: declared IBM Plex Sans versus mobile System | Current-baseline reference decision in #738; future Next named styles belong to [#696](https://github.com/eten-tech-foundation/fluent-mobile/issues/696) / [PR #698](https://github.com/eten-tech-foundation/fluent-mobile/pull/698), with redesign questions in [PR #697](https://github.com/eten-tech-foundation/fluent-mobile/pull/697). |
| Fixed reference version, route/state mapping, comparable device captures | #738, using the preserved inventory; remaining fixtures/reachable states must be explicit, not assumed PASS. |
| Dated Figma typography, gradients and spacing questions | [Figma audit](theme-figma-audit.md), #696/PR #698 and PR #697 remain their existing design context. Figma requirements are not substituted for the Lovable baseline comparison. |

#724's local implementation checkpoints are provenance, not a claim that a
focused theme PR has merged:

| Checkpoint | Scoped implementation |
| --- | --- |
| `414e0f6f04a36ce0e89f9a1c6d929fb7282b0e91` | Independent current-look Next baseline/modes; runtime headers/cards; guide and regression tests |
| `628de360467660316ec7ce3cf75acdd876bdef30` | Runtime Home/Drafting tab bars and Settings controls |
| `0566f4c05866b1dfa9485de50eab9ee9a268b723` | AccountSwitcherPanel runtime styles and identical overlay token |
| `713c756916ff0de5540e5b0d701f9fe1b21aa8fd` | Drawer runtime styles |
| `88485e0df76ab3b08ddee10d3b49c07d59211a21` | SyncActionControls runtime styles |
| `59c9685ce4f47f30ab321eda9a92c4f225c23fad` | SyncStatusIndicator runtime styles |
| `67cfa7ec48569369823986834bbf7b5f79f045da` | CloudSyncStatusIcon runtime styles |
| `703135f8345f58386fabd6296a97ed5e4fcc3f3e` | ReauthBanner runtime styles |

These checkpoints were reviewed from the audit checkout and #724 issue history.
They are outside this docs-only PR. A focused #724 publication PR remains
separate; these hashes need not resolve on `main` yet. Isolated render/token
checks establish implementation properties, not device/reference acceptance.

The #739 reference analysis retained `menuDivider`, `menuSectionLabel`,
`menuItemDanger`, `containerAppInit`, `errorTextAppInit`, `loadingTextAppInit`
and `appRoot`. The live danger red remains unchanged; draft PR #743 is not
represented as merged or visually verified.

## Current baseline versus future independent themes

The original review described Next's mixed static/runtime styling before the
later #724 checkpoints. The later approved local phase intentionally matches
Next values to the current mobile Legacy baseline while giving each version
and mode independently owned data. The existing baseline is Lovable-aligned
in lineage; its rendered fidelity has not been established.

This docs branch starts from `main`; it does not include #724 implementation
or replace the main branch's current [theming guide](../../guides/ui-version-theming.md).
When #724 lands, preserve the distinction between local checkpoint evidence
and merged behavior. Future Next divergence remains coordinated with
[PR #727](https://github.com/eten-tech-foundation/fluent-mobile/pull/727)
(route tree), [#692](https://github.com/eten-tech-foundation/fluent-mobile/issues/692),
[#694](https://github.com/eten-tech-foundation/fluent-mobile/issues/694),
[#695](https://github.com/eten-tech-foundation/fluent-mobile/issues/695),
[PR #700](https://github.com/eten-tech-foundation/fluent-mobile/pull/700),
[PR #699](https://github.com/eten-tech-foundation/fluent-mobile/pull/699),
and the typography/design work above. None is implemented or rewritten here.

## Remaining comparison work

#738 remains open for approved reference/version/viewport selection, matching
route/state captures, explicit mobile adaptations and evidence-backed fixes
or decisions. Include loading, empty, error and disabled states where relevant.
Use the source inventory as a starting map, not a screenshot coverage claim.
The review's safe-area/hit-slop, Android status-bar and waveform-spacing
adaptations require deliberate review rather than automatic web imitation.

Every original concrete finding now has issue ownership. This does not mean
all findings are implemented, that every potential mismatch has been found,
or that every page/state has passed visual comparison. Newly demonstrated
mismatches should get focused follow-ups after duplicate checks. Mobile/web
feature parity is outside this comparison.
