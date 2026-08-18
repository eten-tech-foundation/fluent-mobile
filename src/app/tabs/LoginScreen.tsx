import React, { useEffect, useRef } from 'react';
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
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation/types';
import { theme } from '../../theme';
import { useLogin } from '../../hooks/useLogin';
import { AuthFormError } from '../../components/ui/AuthFormError';
import { REAUTH_SUBMIT_BUTTON } from '../../constants/messages';
import { authFormStyles as styles } from './authFormStyles';

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void;
  initialEmail?: string;
  title?: string;
  subtitle?: string;
  /** Password-only re-sign-in (session refresh); locks email and hides legal/footer links. */
  variant?: 'default' | 'reauth' | 'addAccount';
}

export default function LoginScreen({
  onLoginSuccess,
  initialEmail = '',
  title = 'Welcome',
  subtitle = 'Log in to continue to Fluent.',
  variant = 'default',
}: LoginScreenProps) {
  const isReauth = variant === 'reauth';
  const sessionMode =
    variant === 'addAccount'
      ? 'addAccount'
      : variant === 'reauth'
      ? 'reauth'
      : 'login';
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const passwordInputRef = useRef<TextInput>(null);
  const {
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
  } = useLogin(onLoginSuccess, { initialEmail, sessionMode });

  useEffect(() => {
    if (!isReauth) {
      return;
    }
    const focusTimer = setTimeout(() => {
      passwordInputRef.current?.focus();
      passwordInputRef.current?.setNativeProps({
        selection: { start: 0, end: 0 },
      });
    }, 150);
    return () => clearTimeout(focusTimer);
  }, [isReauth]);

  const focusPasswordAtStart = () => {
    if (!isReauth) {
      return;
    }
    passwordInputRef.current?.setNativeProps({
      selection: { start: 0, end: 0 },
    });
  };

  const hasEmailError = Boolean(fieldErrors.email || globalError);
  const hasPasswordError = Boolean(fieldErrors.password || globalError);
  const showEmailLabel = isReauth || email.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollGrow}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, isReauth && styles.cardCompact]}>
          <Image
            accessibilityLabel="Fluent logo"
            source={require('../../assets/icons/Fluent-Blue-Icon-720.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.wrapper}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.fieldContainer}>
              {showEmailLabel ? (
                <Text
                  style={[
                    styles.floatingLabel,
                    hasEmailError && styles.floatingLabelError,
                  ]}
                >
                  Email address*
                </Text>
              ) : null}
              <TextInput
                style={[
                  styles.input,
                  hasEmailError && styles.inputErrorBorder,
                  isReauth && styles.inputDisabled,
                ]}
                placeholder={showEmailLabel ? '' : 'Email address*'}
                placeholderTextColor={theme.colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isReauth && !isSubmitting}
                showSoftInputOnFocus={!isReauth}
                selection={isReauth ? { start: 0, end: 0 } : undefined}
                accessibilityLabel="Email address"
                accessibilityState={{ disabled: isReauth }}
                testID="login-email-input"
              />
              <AuthFormError
                text={fieldErrors.email}
                testID="login-email-error"
              />
            </View>

            <View style={styles.fieldContainer}>
              {password.length > 0 && (
                <Text
                  style={[
                    styles.floatingLabel,
                    hasPasswordError && styles.floatingLabelError,
                  ]}
                >
                  Password*
                </Text>
              )}
              <View style={styles.passwordWrapper}>
                <TextInput
                  ref={passwordInputRef}
                  style={[
                    styles.passwordInput,
                    hasPasswordError && styles.inputErrorBorder,
                  ]}
                  placeholder={password.length > 0 ? '' : 'Password*'}
                  placeholderTextColor={theme.colors.mutedForeground}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  editable={!isSubmitting}
                  onFocus={focusPasswordAtStart}
                  accessibilityLabel="Password"
                  testID="login-password-input"
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(current => !current)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  testID="login-password-toggle"
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.colors.mutedForeground}
                  />
                </TouchableOpacity>
              </View>
              <AuthFormError
                text={fieldErrors.password}
                testID="login-password-error"
              />
              <AuthFormError
                text={globalError ?? undefined}
                testID="login-global-error"
              />
            </View>

            {!isReauth ? (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() =>
                  navigation.navigate('ForgotPassword', {
                    initialEmail: email.trim() || undefined,
                  })
                }
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                testID="login-forgot-password-link"
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={isReauth ? REAUTH_SUBMIT_BUTTON : 'Continue'}
              accessibilityState={{
                disabled: isSubmitting,
                busy: isSubmitting,
              }}
              testID="login-submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isReauth ? REAUTH_SUBMIT_BUTTON : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {!isReauth ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                By continuing, you agree to the{' '}
                <Text
                  style={styles.footerLink}
                  accessibilityRole="link"
                  onPress={() => navigation.navigate('PrivacyPolicy')}
                  testID="login-privacy-link"
                >
                  Privacy Policy
                </Text>{' '}
                and{' '}
                <Text
                  style={styles.footerLink}
                  accessibilityRole="link"
                  onPress={() => navigation.navigate('TermsOfUse')}
                  testID="login-terms-link"
                >
                  Terms.
                </Text>
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
