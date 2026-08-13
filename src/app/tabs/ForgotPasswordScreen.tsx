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
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { useForgotPassword } from '../../hooks/useForgotPassword';
import { hrefs } from '../../navigation/hrefs';
import { parseOptionalString } from '../../navigation/routeParams';
import { theme } from '../../theme';
import { AuthFormError } from '../../components/ui/AuthFormError';
import { authFormStyles as styles } from './authFormStyles';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const segments = useSegments();
  const inAppGroup = segments.some(segment => segment === '(app)');
  const rawParams = useLocalSearchParams<{ initialEmail?: string }>();
  const initialEmail = parseOptionalString(rawParams.initialEmail) ?? '';
  const {
    view,
    email,
    setEmail,
    fieldError,
    globalError,
    isSending,
    sendResetEmail,
    resetToForm,
  } = useForgotPassword(initialEmail);

  const hasError = Boolean(fieldError || globalError);

  const handleBackToLogin = () => {
    if (inAppGroup) {
      // Authenticated Add User flow — stay in the app group.
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace(hrefs.addUser);
      return;
    }
    router.replace(hrefs.login);
  };

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

          {view === 'form' ? (
            <View style={styles.wrapper}>
              <Text style={styles.title} accessibilityRole="header">
                Forgot Your Password?
              </Text>
              <Text style={styles.subtitle}>
                Enter your email address to reset your password.
              </Text>

              <View style={styles.fieldContainer}>
                {email.length > 0 && (
                  <Text
                    style={[
                      styles.floatingLabel,
                      hasError && styles.floatingLabelError,
                    ]}
                  >
                    Email address*
                  </Text>
                )}
                <TextInput
                  style={[styles.input, hasError && styles.inputErrorBorder]}
                  placeholder={email.length > 0 ? '' : 'Email address*'}
                  placeholderTextColor={theme.colors.mutedForeground}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isSending}
                  accessibilityLabel="Email address"
                  testID="forgot-password-email-input"
                />
                <AuthFormError
                  text={fieldError ?? undefined}
                  testID="forgot-password-field-error"
                />
                <AuthFormError
                  text={globalError ?? undefined}
                  testID="forgot-password-global-error"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  isSending && styles.primaryButtonDisabled,
                ]}
                onPress={sendResetEmail}
                disabled={isSending}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Send reset email"
                accessibilityState={{ disabled: isSending, busy: isSending }}
                testID="forgot-password-submit-button"
              >
                {isSending ? (
                  <ActivityIndicator color={theme.colors.primaryForeground} />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.subSecondaryLink}
                onPress={handleBackToLogin}
                accessibilityRole="button"
                accessibilityLabel="Back to login"
                testID="forgot-password-back-link"
              >
                <Text style={styles.linkText}>Back to Fluent</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.wrapper} testID="forgot-password-sent-view">
              <View style={styles.successIconCircle}>
                <Ionicons
                  name="mail"
                  size={36}
                  color={theme.colors.syncSynced}
                />
              </View>

              <Text style={styles.title} accessibilityRole="header">
                Check Your Email
              </Text>
              <Text style={styles.subtitle}>
                Check <Text style={styles.boldTargetText}>{email.trim()}</Text>{' '}
                for instructions.
              </Text>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={resetToForm}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Resend email"
                testID="forgot-password-resend-button"
              >
                <Text style={styles.secondaryButtonText}>Resend email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.subSecondaryLink}
                onPress={handleBackToLogin}
                accessibilityRole="button"
                accessibilityLabel="Back to login"
                testID="forgot-password-sent-back-link"
              >
                <Text style={styles.linkText}>Back to login</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
