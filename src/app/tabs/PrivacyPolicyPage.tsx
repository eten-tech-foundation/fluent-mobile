import React from 'react';
import { Text } from 'react-native';
import { LegalDocumentLayout } from '../../components/layout/LegalDocumentLayout';
import { legalTextStyles as styles } from './legalDocumentStyles';

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout title="Privacy Policy" testID="privacy-policy-scroll">
      <Text style={styles.title} accessibilityRole="header">
        Privacy Policy
      </Text>
      <Text style={styles.paragraph}>
        Fluent offers an AI-generated draft feature to help you create initial
        translations more efficiently. This system may send your translated
        verses and related translation resources to an AI model for processing.
        Your data will not be used for model training. OR Your data may be used
        for model training. The resulting text is a machine-generated suggestion
        only — it may contain errors or inaccuracies and must be reviewed by a
        human translator before acceptance.
      </Text>
      <Text style={styles.paragraph}>
        Unless specified otherwise we do not share your information with
        third-parties. We will, however, collect basic information that is
        needed to run the application successfully. By continuing, you agree to
        the use of your translations to aid with creating AI-generated content.
      </Text>
    </LegalDocumentLayout>
  );
}
