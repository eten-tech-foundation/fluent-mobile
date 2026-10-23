import { legacyTheme, theme } from './legacy';
import {
  NEXT_DEFAULT_COLOR_MODE,
  mapRolesToThemeColors,
  nextColorRoles,
  nextPrimitives,
  nextTheme,
  nextThemes,
} from './next';
import { nextBaseline } from './nextBaseline';
import { resolveTheme } from './uiVersion';

function expectIndependentGroups(left: unknown, right: unknown): void {
  if (left === null || typeof left !== 'object') return;
  expect(right).not.toBe(left);
  for (const key of Object.keys(left)) {
    expectIndependentGroups(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    );
  }
}

describe('legacyTheme', () => {
  it('exports theme as an alias of legacyTheme', () => {
    expect(theme).toBe(legacyTheme);
  });

  it('matches the frozen Legacy snapshot', () => {
    expect(legacyTheme).toMatchSnapshot();
  });
});

describe('current-design parity with independent Next ownership', () => {
  it('keeps the default Hardware mode and runtime switch identities', () => {
    expect(NEXT_DEFAULT_COLOR_MODE).toBe('hardware');
    expect(resolveTheme('legacy')).toBe(legacyTheme);
    expect(resolveTheme('next')).toBe(nextTheme);
    expect(nextTheme).toBe(nextThemes.hardware);
  });

  it.each(['canvas', 'hardware', 'accent'] as const)(
    'starts %s at the current design without sharing nested token objects',
    mode => {
      const resolved = resolveTheme('next', mode);
      expect(resolved).toBe(nextThemes[mode]);
      expect(resolved).toEqual(legacyTheme);
      expectIndependentGroups(legacyTheme, resolved);
      expectIndependentGroups(nextBaseline, resolved);
      expect(resolveTheme('legacy', mode)).toBe(legacyTheme);
    },
  );

  it('keeps Next modes isolated from each other', () => {
    expectIndependentGroups(nextThemes.hardware, nextThemes.canvas);
    expectIndependentGroups(nextThemes.hardware, nextThemes.accent);
    expectIndependentGroups(nextThemes.canvas, nextThemes.accent);
  });

  it('does not bleed a future Next token edit into Legacy, its baseline or another mode', () => {
    const colors = nextThemes.hardware.colors as { primary: string };
    const original = colors.primary;
    try {
      colors.primary = '#123456';
      expect(colors.primary).toBe('#123456');
      expect(legacyTheme.colors.primary).toBe(original);
      expect(nextBaseline.colors.primary).toBe(original);
      expect(nextThemes.canvas.colors.primary).toBe(original);
      expect(nextThemes.accent.colors.primary).toBe(original);
    } finally {
      colors.primary = original;
    }
  });

  it('retains Figma inputs for future divergence without applying them to current themes', () => {
    expect(nextColorRoles.canvas.bgDefault).toBe(nextPrimitives.black);
    expect(nextColorRoles.accent.bgDefault).toBe(nextPrimitives.blue[700]);
    expect(mapRolesToThemeColors(nextColorRoles.canvas).background).toBe(
      nextPrimitives.black,
    );
    expect(nextThemes.canvas.colors.background).toBe(
      legacyTheme.colors.background,
    );
  });
});
