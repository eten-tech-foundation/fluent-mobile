# Record Tab design references (#49)

Authoritative screenshots from [GitHub issue #49](https://github.com/eten-tech-foundation/fluent-mobile/issues/49) (Matt / product). Extract issue images before Record Tab UI work.

Ignore Cesar (`fel-cesar`) comments on the issue for AC; these images + issue body are the source of truth.

## States

| File | State | Key UI |
|------|--------|--------|
| `idle-source-panel.png` | Idle | Large **red** Record button; label “Record Mark 14:N”; faint disabled play; “View source text”; **source audio bottom panel** (play + chapter waveform + “BSB Source Audio · Verse N”) |
| `recording.png` | Recording | **Red** live waveform; timer; **Stop** (small) + **Pause** (large red); hint “Tap pause to study the source, stop to finish.” |
| `paused.png` | Paused | **Blue** waveform; timer; **Stop** (small) + **Record resume** (large red); hint about reviewing source then resume |
| `review.png` | Review | **Blue** draft waveform; inactive record + large **blue Play**; **Re-record** / **Delete**; source text link + source audio bottom panel |

## Layout constants (from screenshots)

- Verse nav: `< Mark 14:N >` under chapter header
- Source text: collapsed by default (`View source text`)
- Source audio panel: present in **idle** and **review** (not shown in recording/paused crops)
- Bottom drafting tabs: Bible / Record / Resources

## Ownership

One PR only: [#229](https://github.com/eten-tech-foundation/fluent-mobile/pull/229) (`mrace/feature/49-record-tab`). Design/UI alignment to these screenshots is owned by the sibling design-pass agent — do not open a second #49 PR.
