declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL: string;
    EXPO_PUBLIC_AQUIFER_API_BASE_URL?: string;
    AQUIFER_API_KEY?: string;
  }
}
