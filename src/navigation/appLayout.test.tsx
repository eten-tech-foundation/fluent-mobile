import React from 'react';
import { act, render } from '@testing-library/react-native';
import AppDrawerLayout from '../routes/(app)/_layout';
import { hrefs } from './hrefs';
import type { PausedTakeMarker } from '../services/pausedTakes';

type DrawerOptions = { swipeEnabled?: boolean };

let mockOnResume: (marker: PausedTakeMarker) => Promise<boolean> = async () =>
  false;
let mockDrawerOptions: DrawerOptions = {};
let mockUserId: number | null = 7;
const mockNavigate = jest.fn();
const mockResolve = jest.fn();

jest.mock('./AuthSessionProvider', () => ({
  useAuthSession: () => ({
    signOut: jest.fn(),
    notifyUserSwitched: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('expo-router/drawer', () => {
  const Drawer = ({
    screenOptions,
    children,
  }: {
    screenOptions: DrawerOptions;
    children: React.ReactNode;
  }) => {
    mockDrawerOptions = screenOptions;
    return children;
  };
  Drawer.Screen = () => null;
  return { Drawer };
});

jest.mock('@react-native-vector-icons/ionicons', () => ({
  Ionicons: () => null,
}));

jest.mock('../components/ui/UserSettingsMenu', () => ({
  DRAWER_MENU_ICON_SIZE: 24,
  UserSettingsMenu: () => null,
  drawerMenuItemStyle: {},
  useDrawerMenuLabelStyles: () => ({ label: {} }),
}));

jest.mock('../theme/useTheme', () => ({
  useTheme: () => ({
    colors: {
      drawerOverlay: '#000000',
      primary: '#0000ff',
      foreground: '#111111',
      cardBackground: '#ffffff',
    },
  }),
}));

jest.mock('../services/useLaunchRecoveryPrompt', () => ({
  useLaunchRecoveryPrompt: (opts: {
    onResume: (marker: PausedTakeMarker) => Promise<boolean>;
  }) => {
    mockOnResume = opts.onResume;
  },
}));

jest.mock('./recoveryHref', () => ({
  resolveRecoveryHref: (...args: unknown[]) => mockResolve(...args),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => mockUserId,
}));

const marker = (fields: Partial<PausedTakeMarker> = {}): PausedTakeMarker => ({
  sessionKey: '5:23',
  segments: ['file:///paused.aac'],
  elapsedMs: 4000,
  startedAt: '2026-11-01T10:00:00Z',
  chapterAssignmentId: 5,
  verseNumber: 23,
  userId: 7,
  ...fields,
});

const passage = hrefs.passage({
  chapterId: 5,
  anchorVerse: 23,
  projectId: 9,
  projectUnitId: 3,
  chapterName: 'Mark 14',
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
  verse: 23,
  recover: { sessionKey: '5:23', verse: 23 },
});

describe('app drawer layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 7;
    mockDrawerOptions = {};
    mockResolve.mockResolvedValue({ status: 'open', href: passage });
  });

  it('leaves drawer swipe off', async () => {
    await render(<AppDrawerLayout />);
    expect(mockDrawerOptions.swipeEnabled).toBe(false);
  });

  it('opens Resume on the saved passage', async () => {
    await render(<AppDrawerLayout />);
    await expect(mockOnResume(marker())).resolves.toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith(passage);
  });

  it('does not open a marker from another account', async () => {
    await render(<AppDrawerLayout />);
    await expect(mockOnResume(marker({ userId: 8 }))).resolves.toBe(false);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate a recovery that finishes after the account changes', async () => {
    let release: (value: unknown) => void = () => {};
    mockResolve.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );
    await render(<AppDrawerLayout />);
    const pending = mockOnResume(marker());
    mockUserId = 8;
    await act(async () => {
      release({ status: 'open', href: passage });
    });
    await expect(pending).resolves.toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate when the chapter cannot be read', async () => {
    mockResolve.mockResolvedValue({ status: 'unread' });
    await render(<AppDrawerLayout />);
    await expect(mockOnResume(marker())).resolves.toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
