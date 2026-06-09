import React from 'react';
import { ScrollView, Text } from 'react-native';
import { Header } from '../../components/ui/Header';
import { SafeAreaView } from 'react-native-safe-area-context';
import { appStyles } from '../appStyles';

export default function PrivacyPolicyPage() {
  return (
    <SafeAreaView style={appStyles.pageSafeAreaWhite}>
      <Header />
      <ScrollView
        style={appStyles.pageScrollView}
        contentContainerStyle={appStyles.pageContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={appStyles.pageTitle}>Privacy Policy</Text>
        <Text style={appStyles.paragraph}>
          Fluent offers an AI-generated draft feature to help you create initial
          translations more efficiently. This system may send your translated
          verses and related translation resources to an AI model for
          processing. Your data will not be used for model training. OR Your
          data may be used for model training. The resulting text is a
          machine-generated suggestion only — it may contain errors or
          inaccuracies and must be reviewed by a human translator before
          acceptance.
        </Text>

        <Text style={appStyles.paragraph}>
          Unless specified otherwise we do not share your information with
          third-parties. We will, however, collect basic information that is
          needed to run the application successfully. By continuing, you agree
          to the use of your translations to aid with creating AI-generated
          content.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
