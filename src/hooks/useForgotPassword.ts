import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FluentAPI } from '../services/api';
import { queryKeys } from '../services/queryKeys';
import { logger } from '../utils/logger';
import { isValidEmail } from '../utils/validateEmail';

const log = logger.create('useForgotPassword');

export function useForgotPassword(initialEmail = '') {
  const [view, setView] = useState<'form' | 'sent'>('form');
  const [email, setEmail] = useState(initialEmail);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const forgotPasswordMutation = useMutation({
    mutationKey: queryKeys.auth.forgotPassword,
    mutationFn: (trimmedEmail: string) =>
      FluentAPI.forgotPassword(trimmedEmail),
    onSuccess: () => {
      setView('sent');
    },
    onError: error => {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Forgot password failed', { error: message });
    },
  });

  const sendResetEmail = () => {
    setFieldError(null);
    forgotPasswordMutation.reset();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError('Please enter an email address');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setFieldError('Please enter a valid email address');
      return;
    }

    forgotPasswordMutation.mutate(trimmedEmail);
  };

  const globalError =
    forgotPasswordMutation.error instanceof Error
      ? forgotPasswordMutation.error.message
      : null;

  const resetToForm = () => {
    setView('form');
    forgotPasswordMutation.reset();
    setFieldError(null);
  };

  return {
    view,
    email,
    setEmail,
    fieldError,
    globalError,
    isSending: forgotPasswordMutation.isPending,
    sendResetEmail,
    resetToForm,
  };
}
