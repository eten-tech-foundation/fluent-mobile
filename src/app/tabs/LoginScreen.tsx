import React from 'react';
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
import { useRouter } from 'expo-router';
import { theme } from '../../theme';
import { useLogin } from '../../hooks/useLogin';
import { AuthFormError } from '../../components/ui/AuthFormError';
import { hrefs } from '../../navigation/hrefs';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { authFormStyles as styles } from './authFormStyles';

interface LoginScreenProps {
  /**
   * Override post-login handling. Defaults to cold `signIn` from auth session.
   * Pass explicitly for Add User (`signInAddUser` + navigate home).
   */
  onLoginSuccess?: (email: string) => void;
  /**
   * Which route group legal / forgot-password links should target.
   * Use `app` when LoginScreen is shown as Add User (authenticated stack).
   */
  legalLinksGroup?: 'auth' | 'app';
}

export default function LoginScreen({
  onLoginSuccess: onLoginSuccessProp,
  legalLinksGroup = 'auth',
}: LoginScreenProps) {
  const { signIn } = useAuthSession();
  const onLoginSuccess = onLoginSuccessProp ?? signIn;
  const router = useRouter();
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
  } = useLogin(onLoginSuccess);

  const hasEmailError = Boolean(fieldErrors.email || globalError);
  const hasPasswordError = Boolean(fieldErrors.password || globalError);

  const forgotHref =
    legalLinksGroup === 'app' ? hrefs.forgotPasswordApp : hrefs.forgotPassword;
  const privacyHref =
    legalLinksGroup === 'app'
      ? hrefs.privacyPolicyApp
      : hrefs.privacyPolicyAuth;
  const termsHref =
    legalLinksGroup === 'app' ? hrefs.termsOfUseApp : hrefs.termsOfUseAuth;

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
        <View style={styles.card}>
          <Image
            accessibilityLabel="Fluent logo"
            source={require('../../assets/icons/Fluent-Blue-Icon-720.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <View style={styles.wrapper}>
            <Text style={styles.title} accessibilityRole="header">
              Welcome
            </Text>
            <Text style={styles.subtitle}>Log in to continue to Fluent.</Text>

            <View style={styles.fieldContainer}>
              {email.length > 0 && (
                <Text
                  style={[
                    styles.floatingLabel,
                    hasEmailError && styles.floatingLabelError,
                  ]}
                >
                  Email address*
                </Text>
              )}
              <TextInput
                style={[styles.input, hasEmailError && styles.inputErrorBorder]}
                placeholder={email.length > 0 ? '' : 'Email address*'}
                placeholderTextColor={theme.colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isSubmitting}
                accessibilityLabel="Email address"
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

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() =>
                router.push(
                  forgotHref({
                    initialEmail: email.trim() || undefined,
                  }),
                )
              }
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              testID="login-forgot-password-link"
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              accessibilityState={{
                disabled: isSubmitting,
                busy: isSubmitting,
              }}
              testID="login-submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to the{' '}
              <Text
                style={styles.footerLink}
                accessibilityRole="link"
                onPress={() => router.push(privacyHref)}
                testID="login-privacy-link"
              >
                Privacy Policy
              </Text>{' '}
              and{' '}
              <Text
                style={styles.footerLink}
                accessibilityRole="link"
                onPress={() => router.push(termsHref)}
                testID="login-terms-link"
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
