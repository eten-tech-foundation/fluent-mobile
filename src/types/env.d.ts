declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL: string;
    EXPO_PUBLIC_AQUIFER_API_BASE_URL?: string;
    /** Local Debug+Metro only — hide Expo Dev Menu for Maestro. Never set on EAS store profiles. */
    EXPO_PUBLIC_E2E_MODE?: string;
    AQUIFER_API_KEY?: string;
  }
}
