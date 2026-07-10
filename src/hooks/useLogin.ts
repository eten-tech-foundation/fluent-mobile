import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FluentAPI } from '../services/api';
import { beginLoginSession } from '../services/authSession';
import { queryKeys } from '../services/queryKeys';
import { logger } from '../utils/logger';
import { isValidEmail } from '../utils/validateEmail';

const log = logger.create('useLogin');

export function useLogin(onLoginSuccess: (email: string) => void) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const loginMutation = useMutation({
    mutationKey: queryKeys.auth.signIn,
    retry: false,
    mutationFn: ({
      email: trimmedEmail,
      password: trimmedPassword,
    }: {
      email: string;
      password: string;
    }) => FluentAPI.signIn(trimmedEmail, trimmedPassword),
    onSuccess: async response => {
      await beginLoginSession(response.token, response.user.email);
      onLoginSuccess(response.user.email);
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

  const globalError =
    loginMutation.error instanceof Error ? loginMutation.error.message : null;

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
