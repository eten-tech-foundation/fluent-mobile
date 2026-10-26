declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL: string;
    EXPO_PUBLIC_AQUIFER_API_BASE_URL?: string;
    /** Local Debug+Metro only — hide Expo Dev Menu for Maestro. Never set on EAS store profiles. */
    EXPO_PUBLIC_E2E_MODE?: string;
    /** Debug + E2E mode + QA API only — skip upload orchestrator auto-start. Never set on EAS profiles. */
    EXPO_PUBLIC_E2E_HOLD_UPLOADS?: string;
    /** Debug + E2E mode + QA API only — skip download-queue auto-resume. Never set on EAS profiles. */
    EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME?: string;
    AQUIFER_API_KEY?: string;
  }
}
