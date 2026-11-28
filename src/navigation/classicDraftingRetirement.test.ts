/**
 * #920 consumer proof. Classic drafting presentation is gone. Shared
 * recording, playback, sync and database code stays. This checks the source
 * tree for static, type-only, dynamic, route, gallery and test references
 * to the removed modules, not only missing filenames.
 */
const fs = require('fs') as {
  existsSync: (file: string) => boolean;
  readFileSync: (file: string, encoding: 'utf8') => string;
  readdirSync: (
    dir: string,
    options: { withFileTypes: true },
  ) => { name: string; isDirectory: () => boolean }[];
};
const path = require('path') as {
  join: (...parts: string[]) => string;
  resolve: (...parts: string[]) => string;
  basename: (file: string) => string;
  relative: (from: string, to: string) => string;
};

const SRC = path.resolve('src');

const REMOVED_FILES = [
  'app/screens/DraftingScreen.tsx',
  'app/screens/ObserverDraftScreen.tsx',
  'app/tabs/BibleTab.tsx',
  'app/tabs/RecordTab.tsx',
  'app/tabs/ResourcesTab.tsx',
  'app/tabs/ObserverDraftTab.tsx',
  'app/context/DraftingContext.tsx',
  'components/layout/SourceAudioShell.tsx',
  'components/layout/SourceAudioPlayerBar.tsx',
  'components/layout/DraftingHeader.tsx',
  'components/layout/DraftingTabBar.tsx',
  'components/ui/DraftTakeRow.tsx',
  'components/ui/SharedTakeRow.tsx',
  'components/ui/WarningBanner.tsx',
  'components/ui/AccountSwitcherPanel.tsx',
  'components/ui/StageAdvanceConfirmSheet.tsx',
  'components/ui/SourceTextAccordion.tsx',
  'components/ui/TakeGroupHeader.tsx',
  'components/ui/RecordCircleButton.tsx',
  'components/ui/VerseRun.tsx',
  'utils/draftingTabState.ts',
  'utils/resourcesTabUiState.ts',
  'types/draftPlaybackControls.ts',
];

/** Identifiers and phrases that only the removed presentation used. */
const REMOVED_TOKENS = [
  'DraftingScreen',
  'ObserverDraftScreen',
  'ObserverDraftTab',
  'DraftingContext',
  'DraftingProvider',
  'useDraftingContext',
  'SourceAudioShell',
  'SourceAudioPlayerBar',
  'SourceAudioProvider',
  'useSourceAudioRecordTabIntegration',
  'useSourceAudioControl',
  'DraftingHeader',
  'DraftingTabBar',
  'DraftTakeRow',
  'SharedTakeRow',
  'WarningBanner',
  'AccountSwitcherPanel',
  'StageAdvanceConfirmSheet',
  'SourceTextAccordion',
  'TakeGroupHeader',
  'RecordCircleButton',
  'VerseRun',
  'draftingTabState',
  'resourcesTabUiState',
  'draftPlaybackControls',
  'OPEN_CLASSIC_DRAFTING',
  'onOpenClassic',
  'passage-classic',
  'Open in classic drafting',
];

const KEPT = [
  'hooks/useRecordSession.ts',
  'hooks/useVerseAudio.ts',
  'hooks/useVerseStep.ts',
  'hooks/useSourceAudio.ts',
  'hooks/useRecordCaptureLeaveGuard.ts',
  'hooks/useDraftingUploadHold.ts',
  'hooks/useObserverDraftChapter.ts',
  'hooks/useBibleTabUnits.ts',
  'app/tabs/resources/ZoomableImage.tsx',
  'routes/(app)/(stack)/verse-detail.tsx',
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...filesUnder(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function mentions(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

describe('classic drafting retirement (#920)', () => {
  const sources = filesUnder(SRC).filter(
    file => path.basename(file) !== 'classicDraftingRetirement.test.ts',
  );

  it('deletes the classic presentation modules', () => {
    const stillThere = REMOVED_FILES.filter(rel =>
      fs.existsSync(path.join(SRC, rel)),
    );
    expect(stillThere).toEqual([]);
  });

  it('keeps the shared recording, playback, observer and resource code', () => {
    const missing = KEPT.filter(rel => !fs.existsSync(path.join(SRC, rel)));
    expect(missing).toEqual([]);
  });

  it('has no static, type-only, dynamic, route, gallery or test reference to a removed module', () => {
    const hits: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      const isTest = file.endsWith('.test.ts') || file.endsWith('.test.tsx');
      // Tests may name the old entry only to assert it is absent.
      const tokens = isTest
        ? REMOVED_TOKENS.filter(
            token =>
              token !== 'passage-classic' &&
              token !== 'Open in classic drafting' &&
              token !== 'onOpenClassic',
          )
        : REMOVED_TOKENS;
      for (const token of tokens) {
        if (mentions(text, token)) {
          hits.push(`${path.relative(SRC, file)}: ${token}`);
        }
      }
      if (
        /from\s+['"][^'"]*(?:BibleTab|RecordTab|ResourcesTab)['"]/.test(text)
      ) {
        hits.push(`${path.relative(SRC, file)}: tab import`);
      }
      if (
        /require\(\s*['"][^'"]*(?:Drafting|BibleTab|RecordTab|ResourcesTab)/.test(
          text,
        )
      ) {
        hits.push(`${path.relative(SRC, file)}: dynamic require`);
      }
      if (
        /import\s+type\s+[^;]*tabs\/(?:Bible|Record|Resources|ObserverDraft)/.test(
          text,
        )
      ) {
        hits.push(`${path.relative(SRC, file)}: type-only tab import`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('adapts verse-detail to Next and keeps recovery parameters on that path', () => {
    const route = fs.readFileSync(
      path.join(SRC, 'routes/(app)/(stack)/verse-detail.tsx'),
      'utf8',
    );
    const link = fs.readFileSync(
      path.join(SRC, 'navigation/verseDetailLink.ts'),
      'utf8',
    );
    expect(route).not.toMatch(/\bDraftingScreen\b/);
    expect(route).toMatch(/openVerseDetailRecovery/);
    expect(route).toMatch(/openVerseDetailChapter/);
    expect(link).toMatch(/recoverSessionKey/);
    expect(link).toMatch(/recoverVerse/);
    expect(link).not.toMatch(/kind:\s*['"]classic['"]/);
  });

  it('does not let the observer data hook import a removed tab type', () => {
    const hook = fs.readFileSync(
      path.join(SRC, 'hooks/useObserverDraftChapter.ts'),
      'utf8',
    );
    expect(hook).not.toMatch(/\bObserverDraftTab\b/);
    expect(hook).not.toMatch(
      /\bObserverDraftUnit\b\s+from\s+['"][^'"]*ObserverDraftTab/,
    );
    expect(hook).toMatch(/ObserverDraftUnit/);
    expect(hook).toMatch(/types\/draftDownload\/types/);
  });
});
