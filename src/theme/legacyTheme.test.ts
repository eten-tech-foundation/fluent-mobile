import { legacyTheme, theme } from './legacy';
import {
  NEXT_DEFAULT_COLOR_MODE,
  mapRolesToThemeColors,
  nextColorRoles,
  nextPrimitives,
  nextRadius,
  nextSpace,
  nextTheme,
  nextTypeStyles,
} from './next';
import { resolveTheme } from './uiVersion';

describe('legacyTheme', () => {
  it('exports theme as an alias of legacyTheme', () => {
    expect(theme).toBe(legacyTheme);
  });

  it('matches the frozen Legacy snapshot', () => {
    expect(legacyTheme).toMatchSnapshot();
  });
});

describe('resolveTheme', () => {
  it('returns legacyTheme for legacy', () => {
    expect(resolveTheme('legacy')).toBe(legacyTheme);
  });

  it('returns nextTheme for next', () => {
    expect(resolveTheme('next')).toBe(nextTheme);
  });
});

describe('nextTheme (Figma Foundations / Hardware)', () => {
  it('is a distinct object from legacyTheme (runtime switch identity)', () => {
    expect(nextTheme).not.toBe(legacyTheme);
  });

  it('defaults Next chrome to Hardware mode', () => {
    expect(NEXT_DEFAULT_COLOR_MODE).toBe('hardware');
  });

  it('maps Hardware roles onto Theme.colors', () => {
    const hardware = nextColorRoles.hardware;
    expect(nextTheme.colors.background).toBe(hardware.bgDefault);
    expect(nextTheme.colors.foreground).toBe(hardware.fgPrimary);
    expect(nextTheme.colors.primary).toBe(hardware.accentPrimary);
    expect(nextTheme.colors.cardBackground).toBe(hardware.surfaceDefault);
    expect(nextTheme.colors.border).toBe(hardware.borderRim);
    expect(nextTheme.colors.recordAccent).toBe(hardware.accentRecord);
  });

  it('uses Foundations spacing and radius on Theme keys', () => {
    expect(nextTheme.spacing.lg).toBe(nextSpace[16]);
    expect(nextTheme.spacing.xxl).toBe(nextSpace[24]);
    expect(nextTheme.radius.md).toBe(nextRadius.md);
    expect(nextTheme.radius.lg).toBe(nextRadius.lg);
    expect(nextTheme.radius.full).toBe(999);
  });

  it('applies Foundations type sizes onto Theme.typography', () => {
    expect(nextTheme.typography.sizes.lg).toBe(nextTypeStyles.title.size);
    expect(nextTheme.typography.sizes.sm).toBe(nextTypeStyles.label.size);
    expect(nextTheme.typography.sizes.xl).toBe(nextTypeStyles.overline.size);
    // reading (42) must not alias onto display (record timer)
    expect(nextTheme.typography.sizes.display).toBe(
      legacyTheme.typography.sizes.display,
    );
    expect(nextTypeStyles.reading.size).toBe(42);
  });

  it('re-derives listCard and headerLayout from resolved tokens', () => {
    expect(nextTheme.listCard.backgroundColor).toBe(
      nextTheme.colors.cardBackground,
    );
    expect(nextTheme.listCard.borderColor).toBe(nextTheme.colors.border);
    expect(nextTheme.listCard.paddingHorizontal).toBe(nextTheme.spacing.lg);
    expect(nextTheme.listCard.borderRadius).toBe(nextTheme.radius.sm);
    expect(nextTheme.homeListContent.padding).toBe(nextTheme.spacing.lg);
    expect(nextTheme.headerLayout.paddingHorizontal).toBe(nextTheme.spacing.lg);
    expect(nextTheme.headerLayout.paddingVertical).toBe(nextTheme.spacing.md);
  });

  it('keeps Legacy sync/warning colors until redesign defines them', () => {
    expect(nextTheme.colors.syncSynced).toBe(legacyTheme.colors.syncSynced);
    expect(nextTheme.colors.warning).toBe(legacyTheme.colors.warning);
  });

  it('exposes Canvas and Accent role tables for future surfaces', () => {
    expect(nextColorRoles.canvas.bgDefault).toBe(nextPrimitives.black);
    expect(nextColorRoles.accent.bgDefault).toBe(nextPrimitives.blue[700]);
    expect(mapRolesToThemeColors(nextColorRoles.canvas).background).toBe(
      nextPrimitives.black,
    );
  });

  it('resolves Hardware roles from primitives', () => {
    expect(nextColorRoles.hardware.bgDefault).toBe(nextPrimitives.bone[50]);
    expect(nextColorRoles.hardware.accentPrimary).toBe(
      nextPrimitives.blue[700],
    );
    expect(nextColorRoles.hardware.accentRecord).toBe(nextPrimitives.red[600]);
  });
});
