import { boolParam } from './routeParams';

/**
 * Typed href builders for Expo Router destinations.
 * Pathnames follow `src/routes` file layout.
 */
export const hrefs = {
  login: '/(auth)/login' as const,
  forgotPassword: (params?: { initialEmail?: string }) =>
    ({
      pathname: '/(auth)/forgot-password' as const,
      params: params?.initialEmail
        ? { initialEmail: params.initialEmail }
        : undefined,
    } as const),
  privacyPolicyAuth: '/(auth)/privacy-policy' as const,
  termsOfUseAuth: '/(auth)/terms-of-use' as const,

  home: (params?: { newUserLoading?: boolean }) => {
    const newUserLoading = boolParam(params?.newUserLoading);
    return {
      pathname: '/(app)/(stack)' as const,
      params:
        newUserLoading !== null && newUserLoading !== undefined
          ? { newUserLoading }
          : undefined,
    } as const;
  },
  settings: '/(app)/settings' as const,
  sync: '/(app)/(stack)/sync' as const,
  prepareForOffline: (params?: {
    projectId?: number;
    projectName?: string;
  }) => {
    const out: Record<string, string> = {};
    if (params?.projectId !== null && params?.projectId !== undefined) {
      out.projectId = String(params.projectId);
    }
    if (params?.projectName !== null && params?.projectName !== undefined) {
      out.projectName = params.projectName;
    }
    return {
      pathname: '/(app)/(stack)/prepare-for-offline' as const,
      params: Object.keys(out).length > 0 ? out : undefined,
    } as const;
  },
  chapters: (params: {
    projectId: number;
    projectName: string;
    language: string;
  }) =>
    ({
      pathname: '/(app)/(stack)/chapters' as const,
      params: {
        projectId: String(params.projectId),
        projectName: params.projectName,
        language: params.language,
      },
    } as const),
  verseDetail: (params: {
    chapterId: number;
    chapterName: string;
    projectName: string;
    language: string;
  }) =>
    ({
      pathname: '/(app)/(stack)/verse-detail' as const,
      params: {
        chapterId: String(params.chapterId),
        chapterName: params.chapterName,
        projectName: params.projectName,
        language: params.language,
      },
    } as const),
  addUser: '/(app)/(stack)/add-user' as const,
  privacyPolicyApp: '/(app)/privacy-policy' as const,
  termsOfUseApp: '/(app)/terms-of-use' as const,
  forgotPasswordApp: (params?: { initialEmail?: string }) =>
    ({
      pathname: '/(app)/(stack)/forgot-password' as const,
      params: params?.initialEmail
        ? { initialEmail: params.initialEmail }
        : undefined,
    } as const),
} as const;
