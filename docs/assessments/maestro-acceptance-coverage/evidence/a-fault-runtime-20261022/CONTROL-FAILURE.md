A metadata fault run — control failure, not product acceptance evidence

The guarded DEV/E2E bundle was loaded (fault_startup_transfer_guard_skip observed). Active cached account12. The initial coordinate tap was a no-op after online layout changed; retained separately. Fresh selector-resolved tap of e2e-audit-metadata-sync invoked the control.

Native ReactNativeJS event at epoch1792641899.404:
SyncScreen — E2E audit metadata sync failed — Upload orchestrator not started — call startUploadOrchestrator first.

The control's default session-active precondition calls getUploadSessionSnapshot, which throws when the intentionally guarded startup leaves the singleton stopped. UI status is error; no sync_error_projects observed during the bounded40-second check. This is a test-control lifecycle defect, not evidence for C0019 or a product failure. No retry or upload-orchestrator start was used.

Isolated correction uses existing Cursor owner ff527503-99b8-4064-9d8e-9ace083222f9, execution7859. Fail-closed semantics and absent-session behavior require focused regression before copying the corrected control. Original backup is retained. B remains stopped. A has no capture/transfer initiated by this action.
