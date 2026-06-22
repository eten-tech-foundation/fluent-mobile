import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { FluentAPI } from '../../services/api';
import { saveTempCredentials } from '../../services/keychain';
import { kvStorage, KV_KEYS } from '../../services/storage';
import { logger } from '../../utils/logger';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation/types';
import { setActiveToken } from '../../services/api';
import { appStyles as styles } from '../appStyles';

const log = logger.create('LoginScreen');

type ViewMode = 'login' | 'forgot' | 'sent';

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [view, setView] = useState<ViewMode>('login');
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginFieldErrors, setLoginFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [globalLoginError, setGlobalLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotFieldError, setForgotFieldError] = useState<string | null>(null);
  const [globalForgotError, setGlobalForgotError] = useState<string | null>(
    null,
  );
  const [isSendingReset, setIsSendingReset] = useState(false);

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleLogin = async () => {
    setLoginFieldErrors({});
    setGlobalLoginError(null);

    let isValid = true;
    const errors: { email?: string; password?: string } = {};

    if (!loginEmail.trim()) {
      errors.email = 'Please enter an email address';
      isValid = false;
    } else if (!isValidEmail(loginEmail.trim())) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (!loginPassword) {
      errors.password = 'Password is required';
      isValid = false;
    }

    if (!isValid) {
      setLoginFieldErrors(errors);
      return;
    }

    try {
      setIsLoggingIn(true);
      const response = await FluentAPI.signIn(loginEmail.trim(), loginPassword);
      await saveTempCredentials(response.token);
      setActiveToken(response.token);
      kvStorage.setItemSync(KV_KEYS.USER_EMAIL, response.user.email);
      onLoginSuccess(response.user.email);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('Login failed', { error: message });
      setGlobalLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotFieldError(null);
    setGlobalForgotError(null);

    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail) {
      setForgotFieldError('Please enter an email address');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setForgotFieldError('Please enter a valid email address');
      return;
    }

    try {
      setIsSendingReset(true);
      await FluentAPI.forgotPassword(trimmedEmail);
      setView('sent');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('Forgot password failed', { error: message });
      setGlobalForgotError(message);
    } finally {
      setIsSendingReset(false);
    }
  };

  const switchToForgot = () => {
    setView('forgot');
    if (loginEmail && !forgotEmail) {
      setForgotEmail(loginEmail);
    }
    setGlobalForgotError(null);
    setForgotFieldError(null);
  };

  const switchToLogin = () => {
    setView('login');
    setGlobalLoginError(null);
    setLoginFieldErrors({});
  };

  // Reusable inline helper template matching your web configuration
  const ErrorLabel = ({ text }: { text?: string }) => {
    if (!text) return null;
    return (
      <View style={styles.errorRow}>
        <Ionicons name="alert-circle" size={16} color="#de350b" />
        <Text style={styles.errorText}>{text}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.loginContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.loginScrollGrow}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.loginCard}>
          <Image
            alt="Logo"
            source={require('../../assets/icons/Fluent-Blue-Icon-720.png')}
            style={styles.loginLogo}
            resizeMode="contain"
          />

          {view === 'login' && (
            <View style={styles.loginWrapperBlock}>
              <Text style={styles.loginTitle}>Welcome</Text>
              <Text style={styles.loginSubtitle}>
                Log in to continue to Fluent.
              </Text>

              <View style={styles.fieldContainer}>
                {loginEmail.length > 0 && (
                  <Text
                    style={[
                      styles.floatingLabel,
                      (loginFieldErrors.email || globalLoginError) &&
                        styles.floatingLabelError,
                    ]}
                  >
                    Email address*
                  </Text>
                )}
                <TextInput
                  style={[
                    styles.loginInput,
                    (loginFieldErrors.email || globalLoginError) &&
                      styles.inputErrorBorder,
                  ]}
                  placeholder={loginEmail.length > 0 ? '' : 'Email address*'}
                  placeholderTextColor="#7a869a"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isLoggingIn}
                />
                <ErrorLabel text={loginFieldErrors.email} />
              </View>

              <View style={styles.fieldContainer}>
                {loginPassword.length > 0 && (
                  <Text
                    style={[
                      styles.floatingLabel,
                      (loginFieldErrors.password || globalLoginError) &&
                        styles.floatingLabelError,
                    ]}
                  >
                    Password*
                  </Text>
                )}
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[
                      styles.passwordInput,
                      (loginFieldErrors.password || globalLoginError) &&
                        styles.inputErrorBorder,
                    ]}
                    placeholder={loginPassword.length > 0 ? '' : 'Password*'}
                    placeholderTextColor="#7a869a"
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    autoCapitalize="none"
                    secureTextEntry={!showPassword}
                    editable={!isLoggingIn}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#7a869a"
                    />
                  </TouchableOpacity>
                </View>
                <ErrorLabel text={loginFieldErrors.password} />
                <ErrorLabel text={globalLoginError ?? undefined} />
              </View>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={switchToForgot}
                disabled={isLoggingIn}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isLoggingIn && styles.primaryButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={isLoggingIn}
                activeOpacity={0.8}
              >
                {isLoggingIn ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {view === 'forgot' && (
            <View style={styles.loginWrapperBlock}>
              <Text style={styles.loginTitle}>Forgot Your Password?</Text>
              <Text style={styles.loginSubtitle}>
                Enter your email address to reset your password.
              </Text>

              <View style={styles.fieldContainer}>
                {forgotEmail.length > 0 && (
                  <Text
                    style={[
                      styles.floatingLabel,
                      (forgotFieldError || globalForgotError) &&
                        styles.floatingLabelError,
                    ]}
                  >
                    Email address*
                  </Text>
                )}
                <TextInput
                  style={[
                    styles.loginInput,
                    (forgotFieldError || globalForgotError) &&
                      styles.inputErrorBorder,
                  ]}
                  placeholder={forgotEmail.length > 0 ? '' : 'Email address*'}
                  placeholderTextColor="#7a869a"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isSendingReset}
                />
                <ErrorLabel text={forgotFieldError ?? undefined} />
                <ErrorLabel text={globalForgotError ?? undefined} />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSendingReset && styles.primaryButtonDisabled,
                ]}
                onPress={handleForgotPassword}
                disabled={isSendingReset}
                activeOpacity={0.8}
              >
                {isSendingReset ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.subSecondaryLink}
                onPress={switchToLogin}
              >
                <Text style={styles.linkText}>Back to Fluent</Text>
              </TouchableOpacity>
            </View>
          )}

          {view === 'sent' && (
            <View style={styles.loginWrapperBlock}>
              <View style={styles.successIconCircle}>
                <Ionicons name="mail" size={36} color="#00875a" />
              </View>

              <Text style={styles.loginTitle}>Check Your Email</Text>
              <Text style={styles.loginSubtitle}>
                Check <Text style={styles.boldTargetText}>{forgotEmail}</Text>{' '}
                for instructions.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setView('forgot')}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Resend email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.subSecondaryLink}
                onPress={switchToLogin}
              >
                <Text style={styles.linkText}>Back to login</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.loginFooter}>
            <Text style={styles.loginFooterText}>
              By continuing, you agree to the{' '}
              <Text
                style={styles.loginFooterLink}
                onPress={() => navigation.navigate('PrivacyPolicy')}
              >
                Privacy Policy
              </Text>{' '}
              and{' '}
              <Text
                style={styles.loginFooterLink}
                onPress={() => navigation.navigate('TermsOfUse')}
              >
                Terms.
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
