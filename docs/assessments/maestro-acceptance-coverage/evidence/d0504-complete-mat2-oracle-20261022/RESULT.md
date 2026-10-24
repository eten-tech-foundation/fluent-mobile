# D0504 — independently complete MAT2 availability comparison

Root bounded evidence comparison,2026-10-22. No device rerun, transfer, sourcechange or APIwrite. New authoritative browser-lane receipt /tmp/project13-eng-MAT2-metadata-receipt-20261022.json observed00:37:53.542Z: project13/eng/MAT2 includeContentfalse, truncatedfalse,220items,192text+28images. No HTTPstatus exposed. No audio-completeness or byte-bound claim.

Actual device evidence reused from approvedA5554 PM9 #757 no-transfer run: artifacts/pr757-no-transfer-20261022/mat2-groups.xml/png, mat2-settled.xml, mat2-tw-restored.xml. This is real sameproject/chapter UI, not source-only or fabricated rendering. No fixture mutation between that runtime and new independent metadata receipt is known. No need to repeat completed size checks. Temporary757 patch affectedsize semantics, not resource grouping/tier availability.

## Nonempty resource-family comparison
API TranslationNotes99text/78497bytes → UIrequiredNotes77KB. Notes mobileTier1 override is explicitly existing UWTranslationNotes mapping; do not mistake wireTier2→requiredTier1 for missingcustomize data.
API Words49text/310909bytes → UITier2 TranslationWords304KB.
API Questions15text/5444bytes → UITier2 TranslationQuestions5KB.
API Commentary29text/121025bytes → UITier3 BibleCommentary118KB.
API28images/zeroadvertisedbytes → UITier3 ReferenceImagesUnknown.
Customize has exactly Words,Questions,Commentary,Images families, no extra optionalresourcefamily in actualhierarchy. RequiredSourceBibleText/Audio andNotes kept outsideoptionalcomparison. Audio source manifest NotFound is distinct and cannot invalidate this independent translation-family comparison or establish an audio bound.

Receipt exports192textitem records plusaggregateimagecount28; it does not export individualimageIDs/names/tiers. UI is family-aggregated, not220itemIDs; no invented per-imageID equality assertion.

## Disposition
Original D0504 literal: Tier2/3 listed match APIavailability AND emptytiershidden.
Nonempty positiveavailability/grouping now runtime-backed against independent truncatedfalse oracle. Promote not_run→partial only, NOTcomplete: no authoritative emptyTier2/Tier3 fixture yet, so hidden-emptytier branch remains unobserved. Missing complete manifest for this nonempty case is no longer the blocker. Do not expand to sourceaudio/transfer-size oracle requirement.
No publicissue/PR duplication. API431/437 truncation history retained; earlierfailedproject15 run remains historical, notcurrentpositive.
Preservation already independentlyverified in priorbatch:11takes+225cachehashes unchanged;205completedqueue,claims0,HomePM9restored. Sourcebaseline unchanged afterinverse. B remainsidlelauncher pending separatelyapprovednetworkcase.
