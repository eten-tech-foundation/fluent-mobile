# A guarded metadata fault — actual runtime evidence

A5554, cached account12. B stopped. Temporary DEV/E2E opt-in projects fault, transfer startup guard enabled; production syncProjects/retrySyncStep path, no upload orchestrator start/Sync Now/transfer.

- Before: sync_error_projects absent.
- Control tooling failure before metadata: absent upload singleton threw. Recorded separately in CONTROL-FAILURE.md, not product evidence. Isolated regression1fail/11pass before,12pass after; only control file recopied, SHA6bc688ab86a33b2a3f8ed0dbb543bcf7e1b4bcd2b7daddaf80d36bf168d6e4e8.
- Corrected run invoked via exact e2e-audit-metadata-sync control. Native readonly KV persisted sync_error_projects|e2e metadata fault: projects (caseS-error-observed.txt).
- Sanitized native events show three injected-error observations at1792642383.097,1792642383.625,1792642384.641; user-step failure1792642384.660; later Bible texts sync completed1792642393.505; metadata finished active-user-error1792642393.507. Earlier pericope-set events precede the fault and are NOT claimed as later continuation.
- App remained responsive. caseS-settled.xml and PNG show testID sync-metadata-error with exact 'Sync failed: projects'. No app global toast visible in captured failed state. The React Native development LogBox banner is preserved in full and NOT hidden/suppressed; it is distinct debug chrome, not an app toast. Do not describe screenshot as error-free.
- Fault-off metadata-only recovery under transfer guard: native key cleared (recovery-error-cleared.txt); actual All users synced successfully native event1792642604.246. No direct SQL writes/error deletion or ordinary Sync Now.

Supports C0019-02 later-step continuation/no crash, C0019-03 actual native step error persistence, C0019-04 named inline error/no app toast. This is a controlled DEV-fault device run, not release/no-instrumentation or permanent Maestro repeatability proof. Ledger reconciliation is separate and pending full batch cleanup.
