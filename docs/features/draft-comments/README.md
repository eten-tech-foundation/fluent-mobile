# Draft comments (#451) — feature docs

Issue-linked implementation notes for mobile draft comments (composer, drawer,
threading, reactions) and the My Work aggregates that consume them (#703).

**Parent view prerequisite:** [#452](https://github.com/eten-tech-foundation/fluent-mobile/issues/452)
(Observer Draft surface). Comment UI attaches to Draft/Record draft surfaces only
— never Bible tab (#451).

| Doc | Purpose |
| --- | --- |
| [Product decisions](product-decisions.md) | Matt-approved product rulings (2026-10-22), including **settled** conflict audio policy |
| [Design & contracts](design.md) | Settled requirements vs decisions; **proposed** API binding; mobile interfaces; acceptance matrix; ownership |

## Ownership boundaries (this lane)

| Area | Owner | Notes |
| --- | --- | --- |
| Mobile comment UI (#451) | Mobile / this lane | Docs first; no API implementation until parent assigns API ownership |
| My Work count/marker (#703) | Mobile My Work lane | Consumes chapter aggregates defined here; row wiring remains #505/#703 |
| Observer Draft view (#452) | Mobile Observer lane | Published PRs #782 / #787 — **do not modify in this comments branch** (#787 conflict fail-closed stays; product policy now settled separately) |
| Backend comment model/endpoints | fluent-api (**owner absent** in bounded search) | Parent must assign; see [design.md](design.md) |

## Non-goals here

- Shared audit ledger, board mutations, GitHub writes from this docs pass
- Inventing unread markers, root-only counts, soft-delete/count-after-delete, or a
  new permission matrix
- Claiming a deployed fluent-api comments surface (API455 and comments API remain
  separate)
