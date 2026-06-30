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
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FluentAPI } from '../../services/api';
import { RootStackParamList } from '../../types/navigation/types';
import { theme } from '../../theme';
import { logger } from '../../utils/logger';
import { isValidEmail } from '../../utils/validateEmail';
import { AuthFormError } from '../../components/ui/AuthFormError';
import { authFormStyles as styles } from './authFormStyles';

const log = logger.create('ForgotPasswordScreen');

type ForgotPasswordRoute = RouteProp<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<ForgotPasswordRoute>();
  const [view, setView] = useState<'form' | 'sent'>('form');
  const [email, setEmail] = useState(route.params?.initialEmail ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendResetEmail = async () => {
    setFieldError(null);
    setGlobalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError('Please enter an email address');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setFieldError('Please enter a valid email address');
      return;
    }

    try {
      setIsSending(true);
      await FluentAPI.forgotPassword(trimmedEmail);
      setView('sent');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('Forgot password failed', { error: message });
      setGlobalError(message);
    } finally {
      setIsSending(false);
    }
  };

  const hasError = Boolean(fieldError || globalError);

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
                onPress={() => navigation.goBack()}
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
                onPress={() => {
                  setView('form');
                  setGlobalError(null);
                  setFieldError(null);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Resend email"
                testID="forgot-password-resend-button"
              >
                <Text style={styles.secondaryButtonText}>Resend email</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.subSecondaryLink}
                onPress={() => navigation.navigate('Login')}
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
