# Next UI redesign (v2)

> **Working draft.** The approach and the [v2 feature manifest](v2-feature-manifest.md)
> are still changing as we prototype, review and learn from devices. Treat both as
> the current direction, not settled decisions.

## Where things live

| Doc | What it's for |
| --- | --- |
| [v2 feature manifest](v2-feature-manifest.md) | The plan: v1 features, gaps, backend parity, summit MVP, beta |
| [Open questions](open-questions.md) | Product and design questions still to answer |
| [Figma to component](../../guides/figma-to-component.md) | How a Figma component becomes code |
| [UI version theming](../../guides/ui-version-theming.md) | Legacy vs Next tokens and color modes |
| [Theme and Figma audit](theme-figma-audit.md) | How code tokens line up with Figma Foundations |

## Design direction

These come from the wayfinding prototype in the component gallery and are still
being tested.

- **Tactile means listen or record.** Raised hardware controls only show up in the
  full-page player and the Now playing bar. Browsing screens stay flat.
- **Each level has its own shape.** We borrow from music apps: a book is an artist,
  its passages are albums, and each passage's listening steps are tracks. The
  player is a full-page cover.
- **Takes are the progress.** Status counts takes. Listening steps only get a
  small dot until you've heard them.
- **The computer voice is always labelled.** Text to speech fills in when there's
  no recording, is never mistaken for one, and is off when the license forbids it.
  Press and hold a passage, or use Hear all, to pick by ear.
- **Status lives in the Now playing bar.** It only shows mid-session. A small wave
  shows what's sounding (red for the mic, blue for the computer voice), and the
  Key shows the one thing you can do next.
- **No breadcrumbs, swipe paging or "do this next" callouts.**

## How we build

- Components come from Figma Foundations through the
  [figma-to-component guide](../../guides/figma-to-component.md). Patterns that
  aren't Figma components are fine when they're built only from Foundations tokens
  and components.
- v2 screens live in `src/app/v2/screens/`. Route files under `(app)` pick the
  Legacy or Next screen by UI version, so there's one signed-in shell.
- v2 calls the same hooks and services as Legacy and doesn't change Legacy screens.
- v2 ships as a beta behind Settings → UI version until it can be the default.

## How we work

- **Full screens first, as working demos.** We build a screen whole on sample
  data in the component gallery, try it on a device, and change direction
  cheaply. Wiring to real data often comes later.
- **What holds up gets split into PRs.** The components a screen needs land
  first, then the screen wired to real hooks. Each PR is based on `main`, one
  at a time per chain, while demos keep running ahead locally.
- The designer builds with an AI agent, and the devs review it like any other PR.
- Work that needs QA references an issue. The rest of the v2 plan is tracked in
  the manifest. Device QA happens on the nightly.
