import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import DraftingScreen from '../../../app/screens/DraftingScreen';
import { hrefs } from '../../../navigation/hrefs';
import { parseOptionalString } from '../../../navigation/routeParams';
import {
  classifyVerseDetailLink,
  openVerseDetailRecovery,
  type VerseDetailLinkParams,
  type VerseDetailRecoveryResult,
} from '../../../navigation/verseDetailLink';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';
import { parseUserId } from '../../../utils/parseUserId';

type SafeKind = 'invalid' | 'missing' | 'unread' | 'stale';

const SAFE_COPY: Record<SafeKind, string> = {
  invalid: "This link isn't valid.",
  missing: "This couldn't be found.",
  unread: "This couldn't be opened. Try again.",
  stale: "This link didn't open. Try again.",
};

function paramText(value: string | string[] | undefined): string {
  return parseOptionalString(value) ?? '';
}

/**
 * Existing verse-detail URLs. A saved recovery link redirects to the Next
 * passage. Anything else that is still a chapter draft opens classic
 * drafting, which #920 removes. Malformed, missing and unreadable links
 * stay here instead of throwing or opening the wrong chapter.
 */
export default function VerseDetailRoute() {
  const raw = useLocalSearchParams<VerseDetailLinkParams>();
  const chapterId = paramText(raw.chapterId);
  const chapterName = paramText(raw.chapterName);
  const recoverSessionKey = paramText(raw.recoverSessionKey);
  const recoverVerse = paramText(raw.recoverVerse);
  const classified = useMemo(
    () =>
      classifyVerseDetailLink({
        chapterId,
        chapterName,
        recoverSessionKey,
        recoverVerse,
      }),
    [chapterId, chapterName, recoverSessionKey, recoverVerse],
  );
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState<VerseDetailRecoveryResult | null>(
    null,
  );

  useEffect(() => {
    if (classified.kind !== 'recover') return;
    const userId = parseUserId();
    let cancelled = false;
    setRecovery(null);
    void openVerseDetailRecovery(classified, () => parseUserId() === userId)
      .then(next => {
        if (cancelled) return;
        if (parseUserId() !== userId) {
          setRecovery({ kind: 'stale' });
          return;
        }
        setRecovery(next);
      })
      .catch(() => {
        if (cancelled) return;
        setRecovery(
          parseUserId() !== userId ? { kind: 'stale' } : { kind: 'unread' },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [classified, attempt]);

  if (classified.kind === 'classic') return <DraftingScreen />;
  if (classified.kind === 'invalid') return <SafeLink kind="invalid" />;
  if (recovery === null) return <PendingLink />;
  if (recovery.kind === 'passage') return <Redirect href={recovery.href} />;
  return (
    <SafeLink
      kind={recovery.kind}
      onRetry={
        recovery.kind === 'unread' || recovery.kind === 'stale'
          ? () => setAttempt(value => value + 1)
          : undefined
      }
    />
  );
}

function PendingLink() {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.bgDefault,
    },
  }));
  return (
    <View style={styles.screen} testID="verse-detail-pending">
      <ActivityIndicator color={theme.roles.accentPrimary} />
    </View>
  );
}

function SafeLink({ kind, onRetry }: { kind: SafeKind; onRetry?: () => void }) {
  const router = useRouter();
  const styles = useThemedStyles(t => ({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.lg,
      padding: t.spacing.xl,
      backgroundColor: t.roles.bgDefault,
    },
    message: {
      ...t.type.body,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
    action: { ...t.type.title, color: t.roles.accentPrimary },
  }));
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(hrefs.home());
  };
  return (
    <View style={styles.screen} testID={`verse-detail-${kind}`}>
      <Text style={styles.message}>{SAFE_COPY[kind]}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          testID="verse-detail-retry"
        >
          <Text style={styles.action}>Try again</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={goBack}
        testID="verse-detail-back"
      >
        <Text style={styles.action}>Go back</Text>
      </Pressable>
    </View>
  );
}
