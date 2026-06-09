import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Header } from '../../components/ui/Header';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appStyles } from '../appStyles';

export default function TermsOfUsePage() {
  const bulletPoints = [
    'AI-generated drafts may contain factual or linguistic errors, omissions, or cultural inaccuracies.',
    'All final translation responsibility rests with the user or translation team.',
    'AI outputs are generated automatically and are not endorsed by Fluent or its affiliated organizations.',
  ];

  return (
    <SafeAreaView style={appStyles.pageSafeAreaBlue}>
      <Header />
      <ScrollView
        style={appStyles.pageScrollView}
        contentContainerStyle={appStyles.pageContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Placed inside the page content body as requested */}
        <Text style={appStyles.pageTitle}>Terms of Use</Text>

        <Text style={appStyles.paragraph}>
          Fluent provides optional tools that use artificial intelligence (“AI”)
          to generate initial translation drafts or text suggestions. These
          drafts are provided solely to assist translators and do not constitute
          authoritative or verified translations.
        </Text>

        <Text style={appStyles.paragraph}>
          Users are responsible for reviewing, editing, and validating all
          AI-generated text before any form of publication or distribution.
          Fluent and its partners make no representations or warranties
          regarding the accuracy, completeness, or reliability of AI-generated
          content.
        </Text>

        <Text style={[appStyles.paragraph, appStyles.paragraphBold]}>
          By using these features, you acknowledge that:
        </Text>

        <View style={appStyles.bulletList}>
          {bulletPoints.map((point, index) => (
            <View key={index} style={appStyles.bulletItem}>
              <Text style={appStyles.bulletMark}>•</Text>
              <Text style={appStyles.bulletText}>{point}</Text>
            </View>
          ))}
        </View>

        <Text style={appStyles.paragraph}>
          If AI services are provided by third parties, the processing of text
          data will comply with Fluent’s Privacy Policy, which describes what
          data may be transmitted and how it is protected.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
