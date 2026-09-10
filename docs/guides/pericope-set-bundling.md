# Refreshing bundled pericope sets

fluent-mobile bundles FCBH and FIA pericope boundary data directly in the
APK for offline-first sync (#447). Source: `FCBH-All-Books.json` /
`FIA-All-Books.json`, copied unmodified from fluent-api's `data/`
directory.

## When to refresh

Whenever fluent-api's `data/FCBH-All-Books.json` or `data/FIA-All-Books.json`
is updated (corrected pericope boundaries, added books, etc.).

## How to refresh

1. Copy the updated file(s) from fluent-api's `data/` directory into
   `assets/pericope-sets/`, overwriting the existing file(s).
2. Bump the corresponding entry in
   `assets/pericope-sets/pericopeSetVersions.ts`
   (`BUNDLED_PERICOPE_VERSIONS[FCBH_SET_ID]` or `[FIA_SET_ID]`) to a new
   date/version string. **This step is required** — #438's sync uses this
   value (via `getPericopeSetVersion`/`setPericopeSetVersion` in
   `services/storage.ts`) to detect that a reseed is needed. Skipping it
   means the app won't pick up the refreshed data until the version
   changes.
3. Run `npm run typecheck && npm test -- pericopeSets` to confirm the
   loader still resolves correctly against the new file.
4. Note the APK size delta in the PR (`du -sh assets/pericope-sets/`
   before/after).

## Format

Both files are flat, per-verse arrays. Book is a full display name
("Genesis"), not a code — `assets/pericope-sets/bookCodeMap.ts` maps
between the two. FCBH has no title field and splits pericope identity
across `fcbh_section` + `fcbh_pericope_number`; FIA has a single
`fia_pericope_number` and an optional `fia_pericope_title`. Both are
normalized into a common shape (`chapterNumber`, `verseNumber`,
`pericopeNumber`, `pericopeTitle`) at read time in
`src/services/pericopeSets.ts` — the bundled files themselves stay
untouched copies of the source exports.

## Scope note

As of this writing, both source files cover the same 34 books (not the
full 66-book canon) — confirm with product/API before assuming full
coverage. `loadBundledPericopeSet()` returns `null` for any book not
present in the export, so sync falls through safely to the network path
(fluent-api#309) once available.