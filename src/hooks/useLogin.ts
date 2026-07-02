import { useState } from 'react';
import { FluentAPI } from '../services/api';
import { beginLoginSession } from '../services/authSession';
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
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setFieldErrors({});
    setGlobalError(null);

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

    try {
      setIsSubmitting(true);
      const response = await FluentAPI.signIn(trimmedEmail, password);
      await beginLoginSession(response.token, response.user.email);
      onLoginSuccess(response.user.email);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('Login failed', { error: message });
      setGlobalError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    fieldErrors,
    globalError,
    isSubmitting,
    handleLogin,
  };
}
