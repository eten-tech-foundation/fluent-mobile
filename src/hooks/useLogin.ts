import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiUser } from '../types/api/responses';
import { FluentAPI } from '../services/api';
import { switchToDeviceAccount } from '../services/accountSession';
import {
  beginAddAccountSession,
  beginLoginSession,
} from '../services/authSession';
import { queryKeys } from '../services/queryKeys';
import { logger } from '../utils/logger';
import { isApiError } from '../services/apiError';
import {
  restoreOfflineSession,
  savePasswordVerifier,
} from '../services/passwordVerifier';
import { isValidEmail } from '../utils/validateEmail';

const log = logger.create('useLogin');

async function rememberPasswordVerifier(
  userId: number | string,
  password: string,
  token: string,
): Promise<void> {
  try {
    await savePasswordVerifier(String(userId), password, token);
  } catch (error) {
    log.warn('Password verifier was not saved', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type LoginSessionMode = 'login' | 'addAccount' | 'reauth';

export type LoginSuccessMeta = { offline?: boolean };

type OnlineSignIn = Awaited<ReturnType<typeof FluentAPI.signIn>>;
type LoginMutationResult =
  | { kind: 'online'; response: OnlineSignIn }
  | { kind: 'offline'; userId: string };

export function useLogin(
  onLoginSuccess: (
    email: string,
    preloadedUser?: ApiUser,
    meta?: LoginSuccessMeta,
  ) => void,
  options?: { initialEmail?: string; sessionMode?: LoginSessionMode },
) {
  const sessionMode = options?.sessionMode ?? 'login';
  const [email, setEmail] = useState(options?.initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const loginMutation = useMutation({
    mutationKey: queryKeys.auth.signIn,
    retry: false,
    mutationFn: async ({
      email: trimmedEmail,
      password: trimmedPassword,
    }: {
      email: string;
      password: string;
    }): Promise<LoginMutationResult> => {
      try {
        const response = await FluentAPI.signIn(trimmedEmail, trimmedPassword);
        return { kind: 'online', response };
      } catch (error) {
        // Adding an account has no stored token to restore.
        if (
          sessionMode === 'addAccount' ||
          !isApiError(error) ||
          error.status !== 0
        ) {
          throw error;
        }
        const restored = await restoreOfflineSession(
          trimmedEmail,
          trimmedPassword,
        );
        if (restored.ok) {
          return { kind: 'offline', userId: restored.userId };
        }
        if (restored.reason === 'mismatch') {
          throw new Error('Incorrect email or password.');
        }
        if (restored.reason === 'locked') {
          throw new Error('Too many attempts. Wait a moment and try again.');
        }
        throw error;
      }
    },
    onSuccess: async (result, variables) => {
      if (result.kind === 'offline') {
        // Restores the stored device session. Does not clear reauth and
        // does not tell the server the session was renewed.
        await switchToDeviceAccount(result.userId);
        onLoginSuccess(variables.email, undefined, { offline: true });
        return;
      }
      const { response } = result;
      if (sessionMode === 'addAccount') {
        const user = await beginAddAccountSession(
          response.token,
          response.user.email,
        );
        // The hash yields the JS thread. Don't hold the signed-in navigation
        // on it. A failed save leaves the next offline attempt on
        // "Unable to connect" until the next online sign-in, because an
        // older verifier is bound to the token this sign-in replaced.
        void rememberPasswordVerifier(
          user.id,
          variables.password,
          response.token,
        );
        onLoginSuccess(response.user.email, user);
      } else {
        const user = await beginLoginSession(
          response.token,
          response.user.email,
        );
        void rememberPasswordVerifier(
          user.id,
          variables.password,
          response.token,
        );
        onLoginSuccess(response.user.email, user);
      }
    },
    onError: error => {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Login failed', { error: message });
    },
  });

  const handleLogin = () => {
    if (loginMutation.isPending) {
      return;
    }

    setFieldErrors({});
    loginMutation.reset();

    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Please enter an email address';
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    loginMutation.mutate({ email: trimmedEmail, password });
  };

  const globalError = (() => {
    const error = loginMutation.error;
    if (!error) return null;

    if (isApiError(error) && error.status === 0) {
      return 'Unable to connect. Please check your internet connection and try again.';
    }

    return error instanceof Error ? error.message : String(error);
  })();

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    fieldErrors,
    globalError,
    isSubmitting: loginMutation.isPending,
    handleLogin,
  };
}
