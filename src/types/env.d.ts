declare namespace NodeJS {
  interface ProcessEnv {
    FLUENT_USER_EMAIL: string;
    API_BASE_URL: string;
  }
}

declare module '@env' {
  export const FLUENT_USER_EMAIL: string;
  export const API_BASE_URL: string;
}
