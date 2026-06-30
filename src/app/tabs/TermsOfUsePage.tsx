import React from 'react';
import { Text, View } from 'react-native';
import { LegalDocumentLayout } from '../../components/layout/LegalDocumentLayout';
import { legalTextStyles as styles } from './legalDocumentStyles';

const bulletPoints = [
  'AI-generated drafts may contain factual or linguistic errors, omissions, or cultural inaccuracies.',
  'All final translation responsibility rests with the user or translation team.',
  'AI outputs are generated automatically and are not endorsed by Fluent or its affiliated organizations.',
];

export default function TermsOfUsePage() {
  return (
    <LegalDocumentLayout title="Terms of Use" testID="terms-of-use-scroll">
      <Text style={styles.title} accessibilityRole="header">
        Terms of Use
      </Text>

      <Text style={styles.paragraph}>
        Fluent provides optional tools that use artificial intelligence (“AI”)
        to generate initial translation drafts or text suggestions. These drafts
        are provided solely to assist translators and do not constitute
        authoritative or verified translations.
      </Text>

      <Text style={styles.paragraph}>
        Users are responsible for reviewing, editing, and validating all
        AI-generated text before any form of publication or distribution. Fluent
        and its partners make no representations or warranties regarding the
        accuracy, completeness, or reliability of AI-generated content.
      </Text>

      <Text style={[styles.paragraph, styles.paragraphBold]}>
        By using these features, you acknowledge that:
      </Text>

      <View style={styles.bulletList}>
        {bulletPoints.map(point => (
          <View key={point} style={styles.bulletItem}>
            <Text style={styles.bulletMark}>•</Text>
            <Text style={styles.bulletText}>{point}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.paragraph}>
        If AI services are provided by third parties, the processing of text
        data will comply with Fluent’s Privacy Policy, which describes what data
        may be transmitted and how it is protected.
      </Text>
    </LegalDocumentLayout>
  );
}
