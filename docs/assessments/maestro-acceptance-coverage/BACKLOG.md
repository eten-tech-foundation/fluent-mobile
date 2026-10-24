# Acceptance to Maestro coverage — reviewed consolidation

Provisional executable backlog; no whole-app percentage.

Ledger dispositions: 308/308; raw candidate requirements: 204; canonical after two exact merges: 202.

## Review limits

- Candidate granularity not fully reviewed; multiple independently falsifiable assertions remain combined. No global atomic denominator.
- All308 issue dispositions does not prove every current applicable acceptance criterion mapped; 23 known partial reference-domain mappings remain.
- Closed issue or shipped source is not current runtime PASS; role labels are not grants; no repeated broad suites.
- New Maestro files are authoring deliverables until current exact execution receipts are linked.
- No disposable QA recording target;944 excluded. Native app remux/seek/audio quality not established by desktop synthetic evidence.

## Cross-domain duplicate/overlap review

- D-0235-01 → A-0004-01 (exact observable duplicate; original provenance retained)
- A-0016-01 → C-0038-01 (exact observable duplicate; original provenance retained)
- A-0025-01, D-0670-01: child of progressive-login parent; #679 scoped master-data residual remains open; retain both linked, no additive atomic denominator
- B-0008-01, D-0408-03: navigation slice overlaps compound record-tab/verse/mic-release group; native mic release distinct
- D-0578-01, D-0417-01: offline resource parent vs image persistence slice; DB representation requires complementary check
- A-0021-01, B-0090-02, B-0009-01: attribution vs epic vs visibility isolation; epic not independent tested criterion

## Prioritized candidate backlog

| Requirement | Priority | Readiness | Requirement / missing assertions |
| --- | --- | --- | --- |
| A-0001-01 | P0 | ready | My Work shows active-user assignments; Assert populated My Work rows belong only to active user (cross-account leakage of row IDs); Stage accordion structure (#505) not asserted |
| A-0002-01 | P0 | ready | Projects/Milestones list is membership-scoped; Membership set equality vs user_projects (UI-only today); orgGrants/roleName never asserted in Maestro — complementary |
| A-0003-01 | P0 | ready | Open project chapter list and navigate back; Explicit chapter-list → back-to-Projects without opening drafting (readonly stop); chapter-ownership-* asserts when present |
| A-0004-01 | P0 | ready | Drafting shell exposes Bible/Resources/Record tabs; Tab state preserved after leave/re-enter chapter |
| A-0005-01 | P0 | ready | Settings reachable; Prepare Offline and Sign Out present; Drawer dismiss-on-scrim / swipe (#255) animation asserts; Accounts section labels after #193 rename |
| A-0006-01 | P0 | ready | Privacy Policy reachable from Settings and scrolls; Ensure settings-privacy-existing-session.yaml present on all worktrees (exists on Documents clone) |
| A-0007-01 | P0 | ready | Terms of Use reachable from Settings and scrolls; Worktree may lack settings-terms-existing-session.yaml — already on Documents clone |
| A-0008-01 | P0 | fixture_blocked | Account switcher lists saved accounts with 3-cap; Explicit 3-cap: hide Add User + limit string with third account; Dismiss switcher without switch |
| A-0009-01 | P0 | ready | Switching accounts updates active identity and scoped lists; Offline switch path (#87); Switch failure keeps current account; Cold restore no silent switch (#293) — see A-0011 |
| A-0010-01 | P0 | fixture_blocked | Sync 401 soft-reauth without wiping credentials; Soft reauth UX on sync 401 without credential wipe; Offline/timeout must NOT set reauth; Credentials retained assert |
| A-0011-01 | P0 | ready | Cold launch restores authenticated session without network; Airplane/offline restore without network; Missing active creds must not silent-switch to other known user; Crash-before-sync persist (#291 durable login) |
| A-0012-01 | P0 | fixture_blocked | Drawer Sign Out warns on unsynced recordings like Settings; Drawer Sign Out path parity with Settings (#622); Force pending-upload fixture so warning is mandatory not optional; Pericope takes counted |
| A-0013-01 | P0 | ready | Login screen gates unauthenticated users;  |
| A-0015-01 | P0 | ready | Home My Work ↔ Projects tab switching;  |
| A-0026-01 | P0 | ready | Settings opens usable (not blank) after account switch; Explicit assert Settings not blank/white after switch |
| A-0027-01 | P0 | ready | Multi-account isolation Maestro flows A–D exist; Residual E if any; Nightly green proof ≠ mapping |
| A-0031-01 | P0 | ready | Login client-side validation errors;  |
| A-0032-01 | P0 | ready | Wrong credentials stay on Login with global error;  |
| A-0034-01 | P0 | ready | Add-account does not hijack active session until switch; Assert active account unchanged until deliberate switch (KV or active chip) |
| B-0001-01 | P0 | fixture_blocked | Record and play local draft audio; audible playback / non-silent energy (Maestro cannot prove audio fidelity); retain-take variant without delete (current flow deletes); ADTS→M4A remux file existence after commit |
| B-0002-01 | P0 | ready | Mic permission dialog and deny path; Go to Settings deep-link assert if product shows that affordance beyond Cancel |
| B-0003-01 | P0 | fixture_blocked | Multi-take cards with single selected take; assert exactly one selected take; cap-at-5 behavior; exclusive playback across cards; take-view-toggle requires multi-recorder fixture (not smoke) |
| B-0004-03 | P0 | fixture_blocked | Playback engine play/pause/seek/stop; seek position assert; duration accuracy |
| B-0006-01 | P0 | fixture_blocked | Committed AAC remuxed to seekable M4A; assert .m4a produced / .aac retained on failure; scrub seek lands mid-take; native module loaded (static APK ≠ loaded) |
| B-0006-02 | P0 | fixture_blocked | Remuxed take must not be silent; non-silent decode assert — beyond Maestro UI; #719 fixture/tooling |
| B-0009-01 | P0 | fixture_blocked | Active-user take isolation on shared device; assert recorded_by_user_id isolation of take cards after switch; B cannot select/delete A's take |
| B-0015-01 | P0 | fixture_blocked | Kill-safe pause recovery and leave prompt; force-stop/kill recovery; screen-lock resume (#486); drawer swipe block (#568 overlap) |
| B-0018-01 | P0 | fixture_blocked | Waveform centered; scrub seeks to tap; tap waveform → seek position; waveform not shifted on record start; stitched row alignment |
| B-0026-01 | P0 | fixture_blocked | Maestro Record happy-path and mic-deny edges; dedicated smoke tag packaging if condensed into #491 |
| C-0019-01 | P0 | fixture_blocked | Per-step sync errors (acceptance group); induce metadata step failure → sync-metadata-error visible with step name; transport sticky-error clear after recovery (#602); continue-after-step-fail without crash |
| C-0019-02 | P0 | fixture_blocked | Failing sync step does not crash or block later steps; continue-after-step-fail without crash |
| C-0019-03 | P0 | complementary_only | Failed sync step persists sync_error_<step> key; assert sync_error_<step> persisted (complementary/source or UI surfacing) |
| C-0019-04 | P0 | fixture_blocked | Sync/metadata chrome surfaces step error without global toast; induce metadata step failure → sync-metadata-error visible with step name; assertNotVisible global toast |
| C-0019-05 | P0 | complete_for_requirement | Transport offline/DNS/timeout do not persist sync_error_* (#602/#660 prevention); controlled ApiError0 native; real DNS/outage untested limitation |
| C-0038-01 | P0 | ready | Home cloud sync icon is sole entry and opens Sync screen; suite-wide adoption proof outside tracked entry; native FG notification not in scope |
| C-0051-01 | P0 | fixture_blocked | Prepare for Offline resource download CTA (acceptance group); Tier1 locked / Customize deselect Tier2/3 excluded from download; Download CTA reappear after chapter switch (#702 cross-domain); live total size |
| C-0051-02 | P1 | complete | PFO grouped resource sizes truthful (cached known + pending Unknown); historical 0B contradiction retained |
| C-0051-03 | P0 | fixture_blocked | Tier1 locked; Customize deselects Tier2/3 only; Tier1 locked / Customize deselect Tier2/3 excluded from download |
| C-0051-04 | P1 | complete | Live Total/CTA for complete/At least/zero selection; historical 2.4MB contradiction retained |
| C-0051-05 | P0 | fixture_blocked | Download CTA enabled rules by assignment/selection; Download disabled until chapter selected (unassigned); Download CTA reappear after chapter switch (#702 cross-domain) |
| C-0051-06 | P0 | fixture_blocked | Download start yields #52 controls and stops #39 auto re-surface; start yields Pause/Cancel; auto re-surface stopped after download-started |
| C-0052-01 | P0 | fixture_blocked | Prepare for Offline download controls (acceptance group); Pause/Resume/Cancel control swap after Download start; progress retain; partial keep on cancel |
| C-0052-02 | P0 | fixture_blocked | Download CTA replaced by Pause + Cancel after start; Pause/Cancel control swap after Download start |
| C-0052-03 | P0 | fixture_blocked | Pause ↔ Resume retains download progress; progress retain across Pause/Resume |
| C-0052-04 | P0 | fixture_blocked | Cancel restores Download CTA and keeps partials; partial keep on cancel; Download CTA restored |
| C-0052-05 | P0 | fixture_blocked | Download item chrome: active ring / completed check / untouched; active progress ring; completed check; untouched pre-download chrome |
| C-0101-01 | P0 | fixture_blocked | Sync status UI updates live from upload worker transitions; live header glyph transitions without refresh; no flash-pending after complete (#621); failed→retry affordance |
| C-0146-01 | P0 | fixture_blocked | Cellular upload/download toggle (acceptance group); cellular-only + toggle off blocks Sync Now AND download start with copy; shared gate upload+download (#546) |
| C-0146-02 | P0 | fixture_blocked | Settings cellular toggle present and off by default; settings toggle off by default |
| C-0146-03 | P0 | fixture_blocked | Sync page cellular toggle mirrors Settings preference; Sync toggle mirrors Settings |
| C-0146-04 | P0 | fixture_blocked | Cellular-off blocks Sync Now / upload with explanation; cellular-only + toggle off blocks Sync Now with copy |
| C-0146-05 | P1 | complete | PFO cellular-off blocks Download start with WiFi/cellular Settings copy (B5556); no transfer press |
| C-0149-01 | P0 | fixture_blocked | Sync page shows status indicator and upload progress chrome; chapter-based progressUploaded/progressTotal monotonic during multi-chapter session; four visual states matrix; notification parity (#600) |
| C-0150-01 | P0 | fixture_blocked | Upload orchestrator: health-online, Wi-Fi auto, cellular gate, pause/cancel windows; /health online definition; Wi-Fi auto-upload without prompt; 24h pause window; Cancel vs Pause semantics; chapter granularity |
| C-0151-01 | P0 | fixture_blocked | Sync action controls state matrix (acceptance group); Paused: Resume+Sync Now+Cancel visible; Pending cellular-disabled Sync Now + explanation; hide controls on All Complete |
| C-0151-02 | P0 | fixture_blocked | Syncing state shows Pause + Cancel; Syncing: Pause+Cancel visible and invoke |
| C-0151-03 | P0 | fixture_blocked | Paused state shows Resume + Sync Now + Cancel; Paused: Resume+Sync Now+Cancel visible |
| C-0151-04 | P0 | fixture_blocked | Pending Sync Now with cellular-off disabled explanation; Pending cellular-disabled Sync Now + explanation |
| C-0151-05 | P0 | fixture_blocked | Upload/All Complete hides action controls; hide controls on All Complete |
| C-0152-01 | P0 | complementary_only | Android FG-service upload notification with chapter progress; FG ongoing notification title/body X of Y; tap notification → Sync; clear on complete/pause/cancel; no crash (#599) |
| C-0256-01 | P0 | fixture_blocked | #256 defines version-token true conflicts and content-hash retry suppression, paired with fluent-api#271. Claude sketch is non-normative; open foundation is not closed by merged indicator/banner UI. Existing protocol/API implementation and controlled dual-device fixtures remain. Remaining: Complete existing mobile#256/API#271 foundation and verify agreed token/hash contract with safe conflict fixture; no duplicate UI fix and no current-build PASS. |
| C-0257-01 | P0 | product_decision | Durable offline stage queue/reconnect PATCH behavior is specified in#257, with Jonathan's existing#529/#530 findings attached; no new duplicate issue. Specific pending-My-Work surface/placement suggestion still needs product confirmation; launch priority is distinct from whether queue behavior is specified. Remaining: Existing#257 durable queue/pull-while-pending implementation, safe stage-change fixture and the narrowly unresolved pending-state presentation decision; no duplicate ticket. |
| C-0267-01 | P0 | ready | Chapter list claim/assignment ownership indicator; conflict defers ownership slot |
| C-0268-01 | P0 | fixture_blocked | Online first recording auto-claims unassigned chapter; approved CLAIM fixture for auto-claim; until then use ownership-status-existing-session read-only; immediate server sync assert; reconnect sibling paths (#271) |
| C-0270-01 | P0 | fixture_blocked | Offline first recording provisionally claims chapter locally; airplane/offline first record provisional mine; chapter_claim_queue pending; no live server check |
| C-0271-01 | P0 | product_decision | Reconnect-claim requirements and concrete Jonathan findings exist; #611/PR667 and#610/PR653 are implemented slices, not full parent closure. Only remaining PM/elapsed conflict paths and API contract/fixture decisions remain unresolved; do not redo the merged slices. Remaining: Verify/reconcile remaining claim-conflict PM/elapsed paths and applicable API contract; preserve#611 claim-before-upload and#610 implemented work, do not infer audio-conflict coverage. |
| C-0530-01 | P0 | complementary_only | #530 is Jonathan's historical returning-online assessment with already-filed child gaps, not a new product specification or a single runtime criterion. Retest/QA updates and open child residuals must be tracked individually. Remaining: Reconcile child#599/#257/#271 and other filed gaps against current evidence; historical Overall Fail and latest external partial passes are not current whole-audit PASS. |
| C-0545-01 | P0 | fixture_blocked | Sync Now is not a silent no-op while pending uploads remain; offline/waiting-Wi-Fi Sync Now disabled or persistent reason; sync-unuploadable-error when pending unuploadable; counts agree with orchestrator |
| C-0548-01 | P0 | fixture_blocked | Sync page shows recordings.upload_error for failed takes; sync-failed-error shows upload_error text; clears after successful retry |
| C-0599-01 | P0 | fixture_blocked | Existing#599 crash/session requirement is explicit. New Roslin QA reports single session/no reconnect crash and successful multi-chapter uploads, with residual multi-account sync failure. Jonathan's earlier crash report and PR609 assessment remain historical; no new duplicate crash ticket or inferred current-build PASS. Remaining: Revision/device-bound current verification and existing multi-account residual ownership/triage; safe pending-take/reconnect approval still required. External QA lacks this audit's build binding. |
| C-0604-01 | P0 | fixture_blocked | Mid-upload network drop silent pause (acceptance group); mid-upload network drop → take pending not failed; silent pause; auto-resume |
| C-0604-02 | P0 | fixture_blocked | Mid-upload network drop leaves take pending not failed; mid-upload network drop → take pending not failed |
| C-0604-03 | P0 | fixture_blocked | Mid-upload drop pauses session silently; silent pause |
| C-0604-04 | P0 | fixture_blocked | Upload auto-resumes when server reachable after drop; auto-resume |
| C-0605-01 | P0 | fixture_blocked | Takes recorded while already online auto-queue upload; take saved while online auto-queues without Sync Now; pause-window end resume; failed session later retry |
| C-0610-01 | P0 | fixture_blocked | Surface offline claim conflicts when chapter held by another; 404 claim → has_conflict + queue resolve on reconnect; no repeated claims sync error; delete takes no orphan claim |
| C-0611-01 | P0 | fixture_blocked | Mobile PR667 is verified merged and explicitly implements#611 claim-before-upload/refresh, pending-assignee preservation and Sync Now visibility. Older retained summary did not follow its PR; no duplicate implementation is needed. Remaining: Preserve existing pending-claim/reconnect ordering and assignee-retention fixture checks on the audited build; merged PR667 is implementation evidence, not our runtime PASS. |
| C-0701-01 | P0 | fixture_blocked | #701 explicitly defines selected-take designation sync even without new audio, pending/ACK and latest selection behavior; retained history records implementation gap, not undefined product behavior. Remaining: Existing#701 implementation/server contract and named selection/ACK fixture; no duplicate feature ticket or unsupported cross-account success claim. |
| C-0716-01 | P0 | fixture_blocked | #716 explicitly defines all-take upload, server deletion and device-only cap; existing owner-credential follow-up from PR723 is now linked in issue comment6316603404. That review follow-up is recorded as such, not claimed as a new product approval or completed code. Remaining: Existing#716 work and owner-authenticated pending/retry follow-up; known all-take/server-delete fixture and authorization required, no duplicate issue or security/source change in this lane. |
| D-0188-01 | P0 | ready | Resources tab remains visible as second drafting tab when empty; explicit empty-host chapter fixture assert |
| D-0188-02 | P0 | fixture_blocked | Resources content follows active Bible/Record unit; assert content change across two units |
| D-0188-03 | P1 | complete | Centered empty Resources message with online-empty oracle (project8/484); delta (-0.5,0) |
| D-0189-01 | P0 | fixture_blocked | Translation Notes section accordion when notes exist; assert TN label + default collapsed |
| D-0189-02 | P0 | fixture_blocked | Translation Notes section hidden when no notes; assertNotVisible TN section |
| D-0190-01 | P0 | fixture_blocked | Translation Questions section accordion when questions exist; assert TQ label + default collapsed |
| D-0190-02 | P0 | fixture_blocked | Translation Questions section hidden when none; assertNotVisible TQ section |
| D-0192-01 | P0 | complete | Resources TN/TQ/Images via PFO inventory; connected cached path zero ALL Network events after sync; prior offline history retained |
| D-0235-02 | P0 | ready | Navigate My Work / Projects into drafting without auth wipe; AUTHORD on HEAD 75d12874 — runtime NOT RUN (await root review before device) |
| D-0407-01 | P0 | fixture_blocked | Settings Verse/Pericope toggle changes Bible and Record display unit; settings drafting-unit control testID + assert unit chrome change |
| D-0408-01 | P0 | fixture_blocked | Source audio dock play control on Bible tab; scrub/seek assertions; offline source audio; error state when missing audio; pericope vs verse tick marks (#408) |
| D-0417-01 | P0 | fixture_blocked | D: Reference Images kind:image mapping and inventory support recorded in retained #417 source review; offline Resources stack implemented by merged mobile PR677 (#578,2026-10-15). Issue417 open status does not establish a product decision. Remaining fixture/current-build verification retained. |
| D-0531-01 | P0 | fixture_blocked | Resources tab sections expand/collapse; assert TN/TQ/Images labels when downloaded; offline airplane mode no network; empty-state when none downloaded (#578) |
| D-0540-01 | P0 | fixture_blocked | Pericope mode next/prev advances by pericope; pericope-mode fixture refs + assert range change |
| D-0564-01 | P0 | ready | Bible unit tap opens Record via onOpenRecord; existing-session variant without warm-home |
| D-0578-01 | P0 | fixture_blocked | D: Offline local-first TN/TQ/Images implementation recorded in merged mobile PR677 (2026-10-15); image-kind support recorded under #417. Open issue/history is not a product hold; prepared-content offline proof remains. Remaining fixture/current-build verification retained. |
| D-0579-01 | P0 | fixture_blocked | Offline: play downloaded source audio from local file first; airplane + local play; network proof complementary |
| D-0579-02 | P0 | fixture_blocked | Offline without downloaded source audio shows unavailable (not spinner); assert empty/unavailable; assertNotVisible indefinite spinner |
| D-0591-01 | P0 | fixture_blocked | TN and TQ hide when loaded empty (like Images); assertNotVisible empty TN/TQ after load |
| D-0702-01 | P0 | ready | Prepare Offline Download control remains when chapters selected; assert download control visible after select; AUTHORD on HEAD 75d12874 — runtime NOT RUN (await root review before device) |
| A-0014-01 | P1 | complete_for_requirement | Forgot-password standalone route (#91); live route/local retained; mocked-API success/resend/failure — server email OOS |
| A-0017-01 | P1 | ready | Prepare Offline entry and back navigation; #503: back from project-download returns to project list not Home |
| A-0018-01 | P1 | fixture_blocked | Settings can switch UiVersion legacy/next at runtime; Settings UiVersion toggle legacy↔next; Legacy visual unchanged when selected; testIDs for theme control |
| A-0019-01 | P1 | fixture_blocked | Drafting header initials when ≥2 accounts; Drafting header initials visible iff ≥2 accounts; Tap opens switcher |
| A-0020-01 | P1 | fixture_blocked | Missing/unreachable API URL shows actionable error; Missing EXPO_PUBLIC_API_BASE_URL actionable error; Unreachable API error+retry; Stored session still enters offline |
| A-0021-01 | P1 | fixture_blocked | Recordings attributed to active user at capture; Assert recorded_by_user_id / UI attribution after switch; Upload owner-token policy |
| A-0022-01 | P1 | product_decision | #505 has explicit stage accordions, Observer population and open Peer Check eligibility requirements; retained history identifies no implementing PR and live bounded PR search found none. Core work is an existing implementation/dependency gap, not an undecided whole feature. Specific pericope-versus-chapter row-label question remains explicitly open in the issue. Remaining: Existing#505 implementation plus Observer/read-only/download dependencies; resolve only the explicitly open Community Review portion row-label question. No duplicate issue/PR. |
| A-0028-01 | P1 | ready | App navigates via Expo Router with auth gate preserved; Single umbrella journey flow optional |
| A-0029-01 | P1 | complementary_only | UNRESOLVED: org role/grant allow-deny conformance on mobile; orgGrants/roleName allow-deny — Maestro cannot prove server authorization |
| A-0033-01 | P1 | ready | Offline login shows connection error then recovers; Reconnect soft-reauth interaction with stored session |
| A-0035-01 | P1 | ready | Deep link home while signed-in/out recovery;  |
| B-0002-02 | P1 | fixture_blocked | Record Tab capture states and Review chrome; explicit idle/paused/review state machine asserts; source accordion open/close |
| B-0004-02 | P1 | fixture_blocked | Recording engine start/pause/resume/stop; engine status API not visible to Maestro |
| B-0008-01 | P1 | fixture_blocked | Record tab loads; verse opens Record; mic released on stop; real duration nonzero after stop; mic released (system-level) |
| B-0010-01 | P1 | fixture_blocked | Warn but allow record on taken chapters;  |
| B-0012-01 | P1 | fixture_blocked | B: Stage progression and mobile confirmation established by mobile PR360 (#258), PR519 (#443), and Chad confirmation2026-09-17. Keep actor/coverage/conflict fixture verification separate from a generic product-decision hold. Remaining fixture/current-build verification retained. |
| B-0013-01 | P1 | fixture_blocked | Chapter advance requires full verse/pericope coverage; block Send when verse/pericope incomplete |
| B-0014-01 | P1 | fixture_blocked | Block recording at Complete stage; Complete-stage record controls disabled; play still works |
| B-0016-01 | P0 | not_run | Drawer-while-recording; Android Back≠drawer; beforeRemove supporting only |
| B-0017-01 | P1 | complete | Multi-take Review play/pause/switch: 0 Maximum update depth (B5556/1184 native); automation gap retained |
| B-0020-01 | P1 | fixture_blocked | Current-stage assignment indicator; full stage matrix Drafting→Peer→Advanced icon rules |
| B-0022-01 | P1 | fixture_blocked | Observer read-only draft view is explicitly specified in#452. Retained history identifies no implementing PR; live issue unchanged and bounded PR search found none. Backend Observer identity is a dependency. Remaining: Existing#452 implementation, backend Observer identity and known Observer/chapter/audio fixture; no duplicate implementation task. |
| B-0023-01 | P1 | fixture_blocked | #704 specifies Peer Check draft-audio chip and download behavior for assigned/open peers. Retained history identifies no implementing PR; bounded numeric search hits were unrelated test-count/Dependabot references and excluded. Remaining: Existing#704 implementation and named peer/draft-audio offline fixture; required transfers remain separately authorized. |
| C-0014-01 | P1 | complementary_only | Manual sync populates core SQLite catalogue tables without duplicates; assert catalogue tables/UI lists populated after first sync; idempotent second sync no duplicate rows; failing-step continue observable |
| C-0039-01 | P1 | fixture_blocked | Prepare for Offline auto-prompt follows connectivity profile matrix; Rarely/Sometimes/Usually auto-prompt matrix; dismiss-without-download re-surface; download-started stops auto re-surface |
| C-0050-01 | P1 | fixture_blocked | Prepare for Offline chapter selection (acceptance group); assigned accordion collapsed/preselected; unassigned open; book select-all; chapter circle select |
| C-0050-02 | P1 | fixture_blocked | PFO header and instructional line; assert Prepare for Offline header + instruction copy |
| C-0050-03 | P1 | fixture_blocked | Assigned chapters accordion collapsed and preselected; assigned accordion collapsed/preselected |
| C-0050-04 | P1 | fixture_blocked | Unassigned chapters accordion open/required; unassigned open |
| C-0050-05 | P1 | fixture_blocked | PFO book select-all and chapter circle free select; book select-all; chapter circle select |
| C-0053-01 | P1 | fixture_blocked | Prepare for Offline manage device storage; Delete Selected + confirm dialog; other-project accordion select; empty state copy |
| C-0100-01 | P1 | complementary_only | Upload worker status machine (acceptance group); pending→uploading→uploaded/failed status machine UI; retry backoff; upload_error persistence |
| C-0100-02 | P1 | complementary_only | Upload worker status pending→uploading→uploaded/failed; pending→uploading→uploaded/failed status machine UI |
| C-0100-03 | P1 | complementary_only | Upload worker persists upload_error and blob_key; upload_error persistence; blob_key on success |
| C-0100-04 | P1 | complementary_only | Upload worker single-flight with bounded retries; retry backoff; single-flight |
| C-0102-01 | P1 | complementary_only | Verse-audio upload contract (supersedes POST /recordings/sync); assert blob_key / HTTP contract codes; 503 terminal failed copy |
| C-0147-01 | P1 | fixture_blocked | Sync page Downloads section shows queue progress when queue >= 1; Downloads section visible only when queue≥1; aggregate bar + N remaining; Manage downloads → PFO |
| C-0177-01 | P1 | fixture_blocked | Assigned Record verses resolve bible_text_id; honest missing-text messaging; Record hint syncing vs unavailable after settled sync; null bibleTextId chapter fixture; disabled record when unavailable |
| C-0234-01 | P1 | fixture_blocked | Chapter-assignment sync does not FK-fail for PM with zero assignments; PM zero-assignment post-login sync without crash/error chrome |
| C-0260-01 | P1 | fixture_blocked | Chapter list shows conflict indicator when has_conflict; conflict coexists with sync icon; My Work + View Project both |
| C-0294-01 | P1 | complementary_only | Sync passes per-request auth tokens (no global authToken mutate); per-request token no global mutate race under switch |
| C-0428-01 | P1 | complete | Assignment sync persists assignee/peer for never-signed-in users; B5556 exact IDs+stub10+same-device other/mine; retained sync; PeerCheck not required |
| C-0483-01 | P1 | fixture_blocked | Merged mobile PR479 already fixes Projects summary query shape. Jonathan authored the PR and reports physical Redmi baseline reproduction and post-fix11-project success in its body. This is existing author QA, not absent implementation or this audit current-build PASS. Remaining: Revision-bound current-build full-offline-catalogue Projects verification remains; reuse Jonathan PR479 author/device evidence, no duplicate query fix. |
| C-0508-01 | P1 | fixture_blocked | Observer offline draft payload/chip behavior is explicit in#508; retained history and bounded live search identify no implementing PR. Depends on#505/#452 and Observer identity. Remaining: Existing#508 implementation/dependencies and safe known Observer payload/offline fixture; no duplicate issue. |
| C-0601-01 | P1 | fixture_blocked | Reachability probes drop stale results and retry after network change; stale /health probe drop; retry after network change; cold start reachability |
| C-0604-05 | P1 | fixture_blocked | Friendly copy if network error reaches upload UI; friendly network error copy if surfaced |
| C-0612-01 | P1 | complementary_only | Warm Sync Now skips full master catalogue and single-flights; warm Sync Now skips full catalogue; double-tap single-flight; claims not blocked behind master |
| C-0613-01 | P1 | fixture_blocked | Uploads target the project unit recorded at capture time; two projects sharing bible+book → upload to capture unit only |
| C-0642-01 | P1 | fixture_blocked | Master-data catalogue GETs use authenticated request path; master-data 401 soft-reauth UX once; no sticky sync_error_master_data; bearer on catalogue |
| C-0675-01 | P1 | fixture_blocked | Sync uses /self list routes and clears cache on empty membership; empty /self/projects clears milestones UI; /self routes (not /users/{id}) — network assert |
| D-0048-01 | P1 | fixture_blocked | Bible rows: selected vs currently-playing visual states; assert selected vs playing state markers |
| D-0048-02 | P1 | fixture_blocked | Bible tap selects unit without auto-playing source audio; assertNotVisible source-audio-playing immediately after select |
| D-0191-01 | P1 | fixture_blocked | Images & Maps section accordion when items exist; assert section presence before fullscreen |
| D-0235-03 | P1 | complete_for_requirement | Source dock empty+loading+error/accessible-Retry chrome; Retry recovery not required/observed (limitation retained) |
| D-0407-02 | P1 | fixture_blocked | Drafting unit preference persists per user; reenter assert mode retained |
| D-0408-02 | P1 | fixture_blocked | Bible Verse/Pericope toggle/player implementation exists in mobile PR535/#541; retained Chad decision waived missing auto-select, while scrub concern remained. Open ticket is not a new decision on the entire toggle surface. Remaining: Both-mode current-build cards/player/ticks/icon verification and exact remaining scrub behavior/fixture; preserve recorded auto-select waiver, do not implement toggle again. |
| D-0408-03 | P1 | fixture_blocked | Bible verse selection can enter Record tab (chrome only; no disposable record); non-mutating bible→record tab-only existing-session flow |
| D-0409-01 | P1 | fixture_blocked | Record unit title shows verse ref or pericope range (never N of M); assert record unit title text patterns |
| D-0504-01 | P1 | complete | Customize Tier2/3 API availability + empty tiers hidden (MAT2 nonempty + project8 empty); project15 truncated retained |
| D-0540-02 | P1 | fixture_blocked | Source Bible text shows full pericope verse range; assert multi-verse source text |
| D-0585-01 | P1 | fixture_blocked | Pericope take upload gating / hydrate (cross-domain); advance CTA disabled when unuploadable; hydrate path — mostly non-UI |
| D-0588-01 | P1 | product_decision | UI explains when project has no local pericope data; assert product copy; verse fallback nav |
| D-0589-01 | P1 | fixture_blocked | Full pericope take label visible on Record with timer; assert long label text not truncated |
| D-0593-01 | P1 | product_decision | Resources cover whole pericope range in pericope mode; pericope range header + multi-verse content |
| D-0594-01 | P1 | fixture_blocked | API PR435 is merged, providing optional image caption/attribution/licenseInfo; its body says mobile#594 already maps those fields. The stale locally-ready/API-implementation blocker is withdrawn. Merge does not prove deployment, populated data or audited mobile rendering. Remaining: Verify deployed API containing PR435, nonempty metadata fixture and audited mobile caption/attribution/thumbnail rendering. No duplicate API implementation; no deployment/current-build PASS inferred. |
| D-0595-01 | P1 | fixture_blocked | D: Mobile no-timestamp oracle resolved: keep playback position, do not restart/seek to zero; implemented by mobile PR651 (merged2026-10-08). API verseTimestamps population remains fluent-api#374. Remaining fixture/current-build verification retained. |
| D-0623-01 | P1 | complete | Confirm before deleting a pericope take from Verse mode — native dialog names vv.13–16 + Cancel retains take at 13/14/15/16 (A5554 cached10/p12/m19/a1183/rec_mvhkn3uc_n1tzsv67); whole-flow MCP~120s timeout + phase3 Back fail retained as tooling limits only |
| A-0010-S41 | P2 | complementary_only | HISTORICAL: hard clear credentials on Session token expired 401; Do not implement — superseded |
| A-0023-01 | P2 | fixture_blocked | #451 explicitly specifies comment entry/composer/panel. Retained history identifies no implementing PR; live issue unchanged and bounded PR search found none. Backend comments/Observer identity and#452 dependency, not undefined product behavior. Remaining: Implement already-filed#451 and its backend/#452 prerequisites, then verify named roles/thread fixtures. No duplicate ticket. |
| A-0024-01 | P2 | fixture_blocked | #703 explicitly specifies comment count and current-user commented marker. Retained history identifies no implementing PR; live issue unchanged and bounded PR search found none. Remaining: Existing#703 implementation and real comment/count/current-user fixtures; no new product re-decision or duplicate issue. |
| A-0025-01 | P2 | fixture_blocked | Existing mobile#679 implementation delivered as open ready PR771 at e2c1d47ff58bdb91d70c1c211144ee6fbaf4b9a6. Uses existing authenticated by-ID API routes for FK parents and defers full catalogue after Tier1. No API/schema change; prior API#373 blocker is withdrawn (updatedAfter/#379 is separate, not duplicated). No merge/deploy/native/timing PASS. Remaining: Review/merge remains separate and paused; CI pending as reported (not read here). After an approved integrated build, verify fresh cold/re-login Home/MyWork readiness before full catalogue on Android. No timing claim or current-build live-login PASS. |
| A-0030-01 | P2 | complementary_only | Next UI Key component + gallery (flag-gated); fluent://gallery Key states — flag-gated non-prod |
| B-0001-00 | P2 | complementary_only | PoC checkbox record/playback only; superseded PoC — do not add flow |
| B-0004-01 | P2 | complementary_only | expo-file-system audio storage paths; Maestro cannot assert local_file_path SQLite; needs complementary adb/unit |
| B-0004-04 | P2 | complementary_only | useVerseAudio testable state machine; reducer pure logic — unit only |
| B-0005-01 | P2 | complementary_only | Recordings join via bible_text_id; SQL join correctness not Maestro-visible |
| B-0007-01 | P2 | fixture_blocked | Clear orphaned paused-take markers; orphan paused clear / Settings clear cache flow |
| B-0011-01 | P2 | ready | Refresh assignment/stage on chapter list open; stage/assignment refresh after external change — live PASS 2026-10-21 before/after 1185 |
| B-0019-01 | P2 | fixture_blocked | Mixed-mode recording and stitched playback; mixed verse/pericope record+stitch play |
| B-0021-01 | P2 | fixture_blocked | Implicit peer checker assignment; existing mobile PR538/API PR334 implemented with external QA (#442 comments6165946842/6176906894); verify current builds + named safe fixtures, no duplicate fix; reopened reason unknown |
| B-0024-01 | P2 | product_decision | Next UI Waveform/Hardware gallery components; Next UI gallery Listen/Record demos |
| B-0025-01 | P2 | complementary_only | Physical-device readiness checklist after Maestro; physical checklist — not Maestro-primary |
| B-0027-01 | P2 | complementary_only | Play/record/re-record audit meta completion; audit meta — not a Maestro product flow |
| B-0090-01 | P2 | complementary_only | Epic: Audio recording & playback Expo modules;  |
| B-0090-02 | P2 | fixture_blocked | Epic: Multi-user projects (recording attribution slice); see B-0009-01 take attribution |
| C-0009-01 | P2 | complementary_only | Scaffold API call demonstrable (historical); scaffold historical |
| C-0016-01 | P2 | complementary_only | Bulk bible-texts skip-if-present (historical); historical skip-bulk — do not automate superseded AC |
| C-0017-01 | P2 | complete | Sync metadata ordered fetch + KV timestamps/counts via shared production metadata phase; normal Sync Now not claimed |
| C-0018-01 | P2 | complementary_only | Home inline four-state sync status row (historical UI); historical Home inline four-state row — superseded |
| C-0077-01 | P2 | complementary_only | R2 worker-pool architecture proposal (historical); historical architecture |
| C-0100-05 | P2 | complementary_only | Upload worker reads local_file_path via expo-file-system; Maestro cannot fully prove filesystem contract |
| C-0374-01 | P2 | complementary_only | C: Removal chosen: MOBILE PR391 removed dead sync.switchUser stub; not fluent-api PR391. Existing contract/source verification on audited revision remains; no implementation-choice product decision. Remaining fixture/current-build verification retained. |
| C-0446-01 | P2 | complementary_only | C: Existing sourceUrl-change requeue implementation via mobile PR672 (merged2026-10-09). Chad2026-10-14 explicitly assigned DevQA because Aquifer content change is not ordinarily device-testable; no product-choice blocker. Remaining fixture/current-build verification retained. |
| C-0620-01 | P2 | complementary_only | SQLite pending-count read failures are not treated as zero; pending-count query failure → not All synced; sign-out warn on unknown |
| D-0407-03 | P2 | fixture_blocked | Account-sync follow-up is already mobile#754/API#434 with approved displayMode contract. Mobile PR760 is merged; API PR439 is open. The stale missing-mobile-client/push/ACK claim is withdrawn. Remaining API release/capability and cross-client/runtime QA are not a duplicate mobile implementation. Remaining: API PR439 merge/release with settingsCapabilities partialMerge+displayMode, audited mobile build containing PR760, then explicitly authorized cross-client runtime QA. No deployment/current-build PASS inferred. |
| D-0409-02 | P2 | fixture_blocked | Record mode/title/navigation implementation and QA lineage exist in PR467 and follow-ups. Retained review identified capture ticks wiring divergence versus older QA; this is implementation/verification ambiguity, not undefined waveform product behavior. Remaining: Safe capture waveform fixture and current revision verification of verse ticks/scrub versus pericope continuous/no-ticks; no automatic fix or PASS from old code/QA claims. |
| D-0412-01 | P2 | fixture_blocked | Shell source-audio shows Verse N/M (or unit) caption; assert unit caption text/testID |
| D-0438-01 | P2 | complete | Pericope set-level hydrate via bundle/GET /pericope-sets/{id}; zero chapter-loop requestWillBeSent |
| D-0447-01 | P2 | complementary_only | Known FIA/FCBH pericope sets bundled in APK seed;  |
| D-0469-01 | P2 | complementary_only | Local bible_texts.id aligns with API verse identity for display/playback; deterministic verse id/label fixture assert |
| D-0474-01 | P2 | complementary_only | Take card full pericope subtitle (withdrawn ticket);  |
| D-0586-01 | P2 | complementary_only | Pericope-mode chapter completeness uses verse-coverage rules;  |
| D-0670-01 | P2 | complementary_only | Progressive first-login sync unblocks Home before full catalogue; assert Home before catalogue completion timing |

## Count milestone — 2026-10-22 D-0623-01 Cancel runtime reconciliation

- Eligible atomic execution coverage **62/8/16 → 63/8/15** (PASS **62→63**, BLOCKED **24→23**).
- D-0623-01 closed complete_for_requirement via bounded native Cancel phases; not whole-flow PASS. Receipt: `/tmp/d0623-final-cancel-runtime-result.md`.

## Atomic unit and inclusion rules

See [UNIT-RULES.md](UNIT-RULES.md). Review classified the existing 204 IDs only; no new candidates were added. Classification remains preliminary. Parent groups are non-additive; harness/process delivery is retained separately from user behavior. No whole-app denominator or percent is published.

## Queued separate visual workstream — Opus High / shared styling

Status: **QUEUED; not started**. User-requested visual work, separate from active #717 E2E validation. Do not modify theme/screens while their E2E checks are active.

- Required execution: **Cursor Opus High**. Verify the actual selected model and High setting before the visual pass; record that evidence. Auto is not a substitute, and Opus has not yet been selected or verified.
- Historically verified design reference: **https://fluent-test1.lovable.app/**. Repo commit `4727043` (`src/theme/iconSpecs.ts`) explicitly aligns icon sizes with that host; `d12434c` (`src/utils/syncStatusState.ts`) cites its Sync chrome/accessibility labels. This verifies repository reference lineage. Live rendering/access was not verified: the web reader could not access the site. Confirm the reference visually before implementation.
- First audit existing theme tokens and shared components. Inventory actual page/routes, current UI-version variants, and reusable primitives before changing screens.
- Prioritize consistency and reuse: typography, spacing, palette, radii, buttons, inputs, cards, navigation, and loading/empty/error/disabled states should come from shared tokens/primitives. Reuse good existing components; consolidate duplicate/ad hoc styles where supported by real repeated use. Avoid premature mega-abstractions and isolated screenshot patches.
- Then perform a page-by-page visual fidelity matrix against the original Lovable reference, checking application of the shared system across **every page**, relevant state, and layout. Record the page/state, reference evidence, mismatch, shared fix, and verification.
- Acceptance: consistent shared styling and reference fidelity across the complete page/state inventory, with justified mobile adaptations documented. Visual one-to-one intent does **not** imply mobile/web feature parity or permission to add web-only features.
- Keep ownership, branch/change scope, and validation separate from active E2E files, sessions and sole-device ownership. No broad visual implementation in the current validation window.

## Implementation dispatch recorded 2026-10-22T19:45:55.343450+00:00

- #505, #703: `01a16524-3ad6-7540-b31b-739e2354800d`
- #451, #452: `01a16524-6252-74cb-9d89-35b26ed70002`
- #508, #704: `01a16524-8976-7588-9006-2300646ea004`
- #679: `01a1651e-4d88-7692-811f-eedeb273302a`

Coding uses Cursor Auto in isolated lanes. Device ownership, current runtime statuses and merge pause remain unchanged. No PR URL is claimed before actual creation.

PR771 merge update (2026-10-22T20:10:18.278873+00:00): verified merged by `mattrace-gloo` at **2026-10-22 20:07:09UTC**, merge commit `c9e82a905889f4c3cdc9d0916be944b4a3613925` now on main. This lane did not merge. Earlier open/ready snapshots are historical. Release deployment and native/login timing remain unproven; A0025 is not promoted. PR770 remains open draft at `85ddeed4`: future integration requirement, not a landed regression. Dedicated board owner handles external status; no board action here.
