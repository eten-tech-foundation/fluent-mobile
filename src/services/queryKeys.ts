/** Stable react-query keys for network actions. UI reads stay SQLite-first. */
export const queryKeys = {
  auth: {
    root: ['auth'] as const,
    signIn: ['auth', 'sign-in'] as const,
    forgotPassword: ['auth', 'forgot-password'] as const,
    signOut: ['auth', 'sign-out'] as const,
  },
} as const;
