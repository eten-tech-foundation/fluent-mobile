# Passage covers — generative shader art

Status: ticketed as #846. v1 approximates the shader with react-native-svg, so
the Skia sections below are the starting point for the Skia follow-up. Author:
Joe Skager, 2026-10-22.

Replaces the flat `surfaceInverse` square in `PassageCover` with album-style art
generated from the passage itself. The art is deterministic (same passage → same
cover, offline, no assets) and **encodes status**: every cover starts with some
blue, grows more blue and more detailed as verses are recorded, and lifts to the
brightest blue only while listening. A pericope is recorded in one take, so its
badge follows peer check instead of metering: a half ring in peer check, then a
check once it passes. Book covers keep a meter for their chapters.

- Design canvas: "Fluent Pericope Covers" (Claude Design), boards
  **A · Field — status vamps** and **Cover component**.
- Reference implementation (web, from the canvas):
  [`design/cover-reference.dc.html`](design/cover-reference.dc.html) — see
  `renderVals()`; only the `direction: 'field'` + `vamp: mist | current | dawn`
  paths and the badge are in scope. The SVG filters there are a stand-in for
  the Skia shader below; match the *look*, not the filter chain.

## Scope (v1)

In:

1. `CoverArt` — Skia shader background with three styles: **Mist**, **Current**, **Dawn**.
2. `CoverStatusBadge` — top-right status ring / check (react-native-svg).
3. `PassageCover` renders `CoverArt` behind its existing text and a11y, with the
   badge top-right.
4. `useBookPassages` exposes the counts the art needs.
5. Home's Books section is a 2-column grid of stacked book covers with the badge.
6. Gallery entry showing the 3 styles × 5 states, plus the book covers.

Out (follow-ups): Orbit rings / take beads direction, animation of the shader,
"now playing" wiring on the book page (the prop exists; nothing on the book
page plays audio yet), chapter stacked covers, how a sent-back pericope shows
once the API sends review notes.

## Visual spec

### Grounds — neutral only

Use theme roles, not hex, so it follows tokens (canvas mode values shown):

| Palette | Ground | Tone (haze) | Active blue (listening) |
| --- | --- | --- | --- |
| `night` (books) | `roles.surfaceSunken` — bone 950 `#121211` | bone 900 `#2C2B29` | blue 600 `#2A70F4` |
| `surface` (passages) | `roles.surfaceDefault` — bone 900 `#2C2B29` | bone 800 `#40403D` | blue 500 `#538EFB` |

Palette by **kind**: book covers are always `night` and passage covers always
`surface`, so a lighter ground never reads as a book's status. Red is never
used (reserved for record state).

Status blue ramp = Foundations blue 900 → 500:
`#022468, #043692, #0B50D0, #2A70F4, #538EFB`. Recording progress tops out
between blue 700 and 600; only `playing` lifts toward blue 500.

### Styles

All three are fbm noise → a soft colour ramp. No discrete shapes (orbs read as
"too obvious"), low contrast, large slow features (the first noise pass read as
"too metal": no ridged turbulence, no high octaves, no hard thresholds).

| Style | Field | What progress does |
| --- | --- | --- |
| Mist | fbm clouds, ~2–3 features across, stretched 1.5× vertically | 1 octave → 2 above p = 0.5 (about 29 % recorded); blue seeps into the lightest folds |
| Current | vertical gradient (dark top → light bottom), domain-warped by fbm | warp strength grows; blue rises from the bottom with a soft edge |
| Dawn | Current, but the gradient runs on a seeded diagonal (−30° to −65°) | blue glows in from one corner and widens |

Style per **chapter** by default (seeded from the chapter key) for coherent
sections; allow a `style` override prop. Open question below.

### The ramp (shared)

For field value `v`, normalised to `u ∈ [0, 1]`:

```
p     = 0.3 + 0.7 * recordedVerses / totalVerses  // starts partway: no cover is blank
haze  = mix(ground, tone, pow(u, 1.4) * 0.75)
top   = 0.8 + 1.6 * p                        // ramp index, 0..4 over the blue list
amt   = smoothstep(thr - 0.30, thr + 0.35, u)
colour = mix(haze, blueAt(min(top, 0.4 + u * top)), amt * 0.9)
if playing: colour = mix(colour, blue500, smoothstep(0.7, 1.0, u) * 0.55)
```

Thresholds: Mist `thr = 0.75 − 0.40p`; Current/Dawn `thr = 0.90 − 0.60p`.
Grain: optional, ±1.5 % luminance hash noise (canvas used a 10 % overlay).

### Text on the cover

Unchanged copy and type styles: eyebrow = `type.meta` (mono, uppercase),
verses = `type.heading`, both `roles.fgPrimary` (bone 100) on these dark
grounds (today's cover uses `fgOnInverse` on a light square — switch it).
Legibility: `textShadowColor` = the ground, `textShadowRadius` ≈ 10 × s
(RN allows one shadow; the canvas used two). `s = coverWidth / 165`
(165 dp = cover width in the 2-column book grid at 390 dp).

### Passage status

A pericope is recorded in one take, so its badge doesn't meter recording; the
art and the status line under the cover carry that.

| State | Status line | Badge |
| --- | --- | --- |
| not recorded | Not recorded yet | none |
| partly recorded | Partly recorded (Legacy verse takes, or crossing into a chapter still in draft) | none |
| recorded, chapter still in draft | Recorded | none |
| in peer check: every chapter it's in was submitted | In peer check | ring, half full |
| peer checked: every chapter it's in passed | Peer checked | check |
| playing | follow-up | |

The badge is the same component as the book cover's below; the eyebrow pads
right by the plate while it shows. Inset `0.55 × padding` (padding =
`spacing.md` × s). Hidden from TalkBack; status stays in the `Pressable`'s
label.

### Book cover

Home's Books section is a 2-column grid (47 % wide, like the book page). Each
book is the same square face as a passage cover, with eyebrow "Book" and the
book's name as the heading (one line, shrinking to fit), on a stack of two
sheets: strips `spacing.sm` tall, `radius.sm` top corners, `surfaceDefault`,
inset `spacing.sm` per step, with a `stroke[1]` gap. The back sheet is at 50 %
so it fades toward the page. Under the cover: the name, the milestone on one
line, then its counts (yours, with others, open, complete), which wrap.

Its badge meters the book: a ring (track `rgba(230,229,221,0.32)`, arc
`fgPrimary`, clockwise from 12) for the share of the book's chapters submitted
for peer check, so a chapter sent back to draft pulls it down, then a filled
`fgPrimary` circle with the `CheckBold` icon in the ground colour once every
chapter has passed.

Badge geometry (× s): plate Ø 30 in the ground colour, ring Ø 21, stroke 2.6.
It's `accessibilityElementsHidden`; status stays in the card's label.

## Implementation

### Dependency

`npx expo install @shopify/react-native-skia` (in Expo's compat set), then
`npm run doctor`. New native module → dev client rebuild; no config plugin
expected (confirm in the Skia docs). Android-only is fine.

### Files (suggested)

```
src/components/ui/coverArt/generator.ts      pure: hash, rng, pickStyle, uniforms(props)
src/components/ui/coverArt/generator.test.ts
src/components/ui/coverArt/coverShader.ts    SkSL source + Skia.RuntimeEffect.Make (module scope, once)
src/components/ui/CoverArt.tsx               <Canvas><Fill><Shader source uniforms/></Fill></Canvas>
src/components/ui/coverArt/useCoverArt.ts    a palette's ground + spec for a cover, shared by both covers
src/components/ui/CoverStatusBadge.tsx       react-native-svg ring / check
src/components/ui/CoverFace.tsx              square face: art, eyebrow, heading, badge top-right
src/components/ui/PassageCover.tsx           passage face + title and status
src/components/ui/BookCover.tsx              book face on a stack of sheets, for Home's grid
src/hooks/useBookPassages.ts                 add counts, seed + peer check
src/app/gallery/entries/PassageCoverEntry.tsx 3 styles × 5 states + book covers
```

Run `npm run architecture-guard` — keep the generator UI-free so it sits
cleanly in the layer rules.

### Determinism

Seed = stable passage id. `unit.key` is already
`pericope:<section>:<pericopeNumber>`; prefix the book (`MRK:pericope:…`) so
covers differ across books. Style seed = `<book>:<chapterNumber>`.
Canvas helpers (port as-is):

```ts
export function hash(s: string): number {           // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string): () => number {    // mulberry32
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Shader (starting point — compile and tune by eye against the canvas)

One `RuntimeEffect` for all three styles; per-cover differences are uniforms.

```glsl
uniform float2 u_size;
uniform float  u_seed;      // (hash(seed) % 997) / 10 — keep offsets small; sin-hash loses precision at large coords on mobile GPUs
uniform float  u_progress;  // artProgress(recorded / total)
uniform float  u_playing;   // 0 | 1
uniform float  u_mode;      // 0 mist, 1 current, 2 dawn
uniform float  u_angle;     // dawn diagonal, radians
uniform float3 u_ground;
uniform float3 u_tone;

const float3 B0 = float3(0.008, 0.141, 0.408);  // blue 900 #022468
const float3 B1 = float3(0.016, 0.212, 0.573);  // blue 800 #043692
const float3 B2 = float3(0.043, 0.314, 0.816);  // blue 700 #0B50D0
const float3 B3 = float3(0.165, 0.439, 0.957);  // blue 600 #2A70F4
const float3 B4 = float3(0.325, 0.557, 0.984);  // blue 500 #538EFB

float hash2(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7)) + u_seed) * 43758.5453); }
float vnoise(float2 p) {
  float2 i = floor(p); float2 f = fract(p);
  float2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + float2(1, 0)), w.x),
             mix(hash2(i + float2(0, 1)), hash2(i + float2(1, 1)), w.x), w.y);
}
float fbm(float2 p, float octaves) {
  float v = 0.0; float a = 0.5;
  for (int k = 0; k < 3; k++) {
    if (float(k) < octaves) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  }
  return v / (1.0 - pow(0.5, octaves));       // keep roughly 0..1
}
float3 blueAt(float x) {
  x = clamp(x, 0.0, 4.0);
  if (x < 1.0) return mix(B0, B1, x);
  if (x < 2.0) return mix(B1, B2, x - 1.0);
  if (x < 3.0) return mix(B2, B3, x - 2.0);
  return mix(B3, B4, x - 3.0);
}

half4 main(float2 xy) {
  float2 uv = xy / u_size;                     // size-independent
  float v; float thr; float lo; float hi;
  if (u_mode < 0.5) {                          // Mist
    v = fbm(uv * float2(2.4, 3.6) + u_seed, u_progress > 0.5 ? 2.0 : 1.0);
    lo = 0.3; hi = 0.7; thr = 0.75 - 0.40 * u_progress;
  } else {                                     // Current / Dawn
    float2 warp = float2(fbm(uv * 2.5 + u_seed, 2.0), fbm(uv * 2.5 + u_seed + 7.3, 2.0)) - 0.5;
    float2 q = uv + warp * (0.11 + 0.09 * u_progress);
    float g = u_mode < 1.5 ? q.y
                           : dot(q - 0.5, float2(cos(u_angle), sin(u_angle))) + 0.5;
    v = 0.85 * g + 0.35 * fbm(uv * 2.5 + u_seed, 2.0) - 0.18;
    lo = 0.0; hi = 1.05; thr = 0.90 - 0.60 * u_progress;
  }
  float u = clamp((v - lo) / (hi - lo), 0.0, 1.0);
  float3 col = mix(u_ground, u_tone, pow(u, 1.4) * 0.75);
  if (u_progress > 0.0) {
    float top = 0.8 + 1.6 * u_progress;
    float amt = smoothstep(thr - 0.30, thr + 0.35, u);
    col = mix(col, blueAt(min(top, 0.4 + u * top)), amt * 0.9);
    col = mix(col, B4, smoothstep(0.7, 1.0, u) * 0.55 * u_playing);
  }
  col += (hash2(xy) - 0.5) * 0.03;             // faint grain
  return half4(half3(col), 1.0);
}
```

### Component API

```ts
type CoverStyle = 'mist' | 'current' | 'dawn';

interface CoverArtProps {
  seed: string;              // e.g. 'MRK:pericope:1:17'
  groupSeed: string;         // e.g. 'MRK:4' → default style
  palette: 'night' | 'surface'; // books night, passages surface
  style?: CoverStyle;        // override
  progress: number;          // artProgress(recordedVerses / totalVerses)
  playing?: boolean;
  size: number;              // measured width (onLayout); cover is square
}
```

`PassageCover` gains `recordedVerses`, `totalVerses`, `submitted`,
`peerChecked`, and later optional `playing` / `listenProgress`; its status
label comes from those. Measure width with `onLayout` (the grid uses
`width: '47%'`).

### Data

`useBookPassages` → `BookPassage` adds `totalVerses`, `recordedVerses`,
`submitted`, `peerChecked` and `seed`. `unitRecordedCount` gives the verses
covered by a take on this device. The whole-chapter fallback has
`chapter.completedVerses` / `totalVerses`. No take counts needed for v1.
A verse in a chapter submitted for peer check counts as recorded, since others'
takes aren't on the device; `submitted` holds once every chapter the passage is
in is past draft, and `peerChecked` once every one has passed peer check.
`HomeBookSummary` adds `totalChapters`, `recordedChapters` and
`checkedChapters` from its chapters' stages.

### Performance

A book can show dozens of covers. Start with one `<Canvas>` per cover
(static shader, no animation). If scrolling janks on a low-end device, render
each cover once to an image (`makeImageSnapshot`) cached by
`seed + progress + palette` and show it with `expo-image`.

## Acceptance

- Same passage + same progress → identical cover across launches and devices.
- Every cover starts with some blue; blue coverage and brightness increase
  monotonically with recorded verses; recorded ≠ playing at a glance (brightest
  blue only when playing).
- A passage's badge is a half ring in peer check and a check once it passes,
  with no badge before; a book's ring meters its chapters.
- Eyebrow and verse range stay legible (≥ 4.5:1 for the 14 sp eyebrow, ≥ 3:1
  for the heading) on the bluest state of each style — spot-check in the gallery.
- No red; grounds come from theme roles.
- TalkBack label unchanged in substance ("<title>, <reference>, <status>").
- Unit tests: `hash`/`rng` determinism, style pick, each kind's ground, the
  art's starting progress, uniforms for 0 %, partial, 100 %, playing. Mock Skia
  in Jest (see the Skia docs' Jest setup).
- Gallery entry: 3 styles × {none, 3/7, recorded, in peer check, peer
  checked}, plus the book covers; listening comes with its follow-up.

**Needs QA: yes** — new native module and visual change; verify on the nightly
per [qa-process.md](../../guides/qa-process.md): book page renders covers,
Home's book grid renders stacked covers, both scroll smoothly on a low-end
device, covers match after app restart.

## Open questions

1. Style per chapter (cohesive sections) vs per passage (more variety)? Default: per chapter.
2. Should collections (chapter / book tiles) get covers in v1? Books on Home
   do; chapter tiles are a follow-up.
3. Where does "listening" first show — passage page header or a future mini player?
4. Animate the shader slowly while playing? (Respect reduced motion; off in v1.)
