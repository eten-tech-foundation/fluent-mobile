import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowDown, Check } from 'lucide-react-native';
import { ProgressRing } from '../../../components/ui/ProgressRing';
import { RoundButton } from '../../../components/ui/RoundButton';
import { useThemedStyles } from '../../../theme/useTheme';

const STEPS = 10;
const STEP_MS = 200;

/**
 * Simulated passage download: tap to start (the ring fills while the button
 * is disabled), then tap the check to remove it. Reaches Default, Pressed and
 * Disabled on the button, and None, In progress and Complete on the ring.
 */
function DownloadDemo({
  variant,
  label,
}: {
  variant: 'soft' | 'flat';
  label: string;
}) {
  const [step, setStep] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const progress = step / STEPS;
  const styles = useThemedStyles(t => ({
    row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg },
    text: { flex: 1, gap: t.spacing.xs },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.md,
      includeFontPadding: false,
    },
    hint: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
  }));

  // Whole steps, so progress lands exactly on 1 and updaters stay pure.
  useEffect(() => {
    if (!downloading) {
      return;
    }
    if (step >= STEPS) {
      setDownloading(false);
      return;
    }
    const timer = setTimeout(() => setStep(s => s + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [downloading, step]);

  const complete = progress >= 1;
  const status = complete
    ? 'Downloaded'
    : downloading
    ? `Downloading ${Math.round(progress * 100)}%`
    : 'Not downloaded';

  return (
    <View style={styles.row}>
      <ProgressRing value={progress} accessibilityLabel={`${label} download`}>
        <RoundButton
          variant={variant}
          icon={complete ? Check : ArrowDown}
          accessibilityLabel={complete ? 'Remove download' : 'Download'}
          disabled={downloading}
          onPress={() => {
            if (complete) {
              setStep(0);
            } else {
              setDownloading(true);
            }
          }}
          testID={`gallery-round-${variant}`}
        />
      </ProgressRing>
      <View style={styles.text}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.hint}>{status}</Text>
      </View>
    </View>
  );
}

export function RoundButtonEntry() {
  const styles = useThemedStyles(t => ({
    demos: { gap: t.spacing.lg },
  }));

  return (
    <View style={styles.demos}>
      <DownloadDemo variant="soft" label="The Last Supper (Soft)" />
      <DownloadDemo variant="flat" label="The Plot to Kill Jesus (Flat)" />
    </View>
  );
}
