let token: string | null = null;

/** In-memory bearer token for authenticated API requests. */
export const authToken = {
  get: (): string | null => token,
  set: (next: string | null): void => {
    token = next;
  },
};
