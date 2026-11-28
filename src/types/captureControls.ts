/**
 * Capture controls surfaced while a take is in progress (recording/paused)
 * so the passage screen can implement the #49 leave
 * prompt: Resume the capture, or Discard it (stop the recorder, delete the
 * temp file, create no take row) and let the requested navigation proceed.
 */
export interface CaptureControls {
  /** Continue the in-progress capture (paused → recording). */
  resume: () => Promise<void>;
  /**
   * Abandon the capture: stop the recorder, delete the temp file, persist
   * no take. Resolves once the capture is fully torn down; safe to navigate
   * after it settles.
   */
  discardCapture: () => Promise<void>;
}
