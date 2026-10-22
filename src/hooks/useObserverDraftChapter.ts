import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObserverDraftUnit } from '../app/tabs/ObserverDraftTab';
import { useAuthSession } from '../navigation/AuthSessionProvider';
import {
  listObserverUnitChapters,
  loadObserverDraftLocalBundle,
  loadObserverSourceVerses,
  resolveObserverDraftChapterAccess,
} from '../services/observerDraftChapter';
import { onAuthReauthRequired, onSyncComplete } from '../services/syncEvents';
import { getActiveUserId, getKnownUserIds } from '../services/storage';
import { hasProjectObserverGrant } from '../services/userOrgGrants';
import type { DraftChapterLocalBundle } from '../types/draftDownload/types';
import type {
  ChapterAssignmentData,
  ChapterListItem,
  VerseData,
} from '../types/db/types';
import { onDownloadQueueChanged } from '../utils/downloadQueueEvents';

function mapUnits(bundle: DraftChapterLocalBundle | null): ObserverDraftUnit[] {
  if (bundle === null) {
    return [];
  }
  return bundle.units.map(unit => ({
    bibleTextId: unit.bibleTextId,
    verseNumber: unit.verseNumber,
    draftText: unit.draftText,
    activeTakeId: unit.activeTakeId,
    localPlaybackUri: unit.localPlaybackUri,
    conflictStatus: unit.conflictStatus,
    // Pass published coverage through — never invent bounds here.
    coverage: unit.coverage ?? null,
  }));
}

export type ObserverDraftChapterState = {
  loading: boolean;
  hasAccess: boolean;
  accountId: string;
  assignment: ChapterAssignmentData | null;
  sourceVerses: VerseData[];
  draftUnits: ObserverDraftUnit[];
  unitChapters: ChapterListItem[];
  bundleStatus: DraftChapterLocalBundle['status'] | null;
  refresh: () => void;
};

/** Identity of the request/session that produced (or is producing) loaded state. */
type LoadScope = {
  accountId: string;
  chapterAssignmentId: number | null;
  projectId: number | null;
  userSwitchEpoch: number;
};

type StoredState = Omit<ObserverDraftChapterState, 'refresh'> & {
  scope: LoadScope;
};

function readLiveScope(input: {
  chapterAssignmentId: number | null;
  projectId: number | null;
  userSwitchEpoch: number;
}): LoadScope {
  return {
    accountId: getActiveUserId(),
    chapterAssignmentId: input.chapterAssignmentId,
    projectId: input.projectId,
    userSwitchEpoch: input.userSwitchEpoch,
  };
}

function scopesMatch(a: LoadScope, b: LoadScope): boolean {
  return (
    a.accountId === b.accountId &&
    a.chapterAssignmentId === b.chapterAssignmentId &&
    a.projectId === b.projectId &&
    a.userSwitchEpoch === b.userSwitchEpoch
  );
}

function isRegisteredAccount(userId: string): boolean {
  return Boolean(userId) && getKnownUserIds().includes(userId);
}

/** Fail closed unless account is registered and holds the exact project grant. */
function scopeHasLiveGrant(scope: LoadScope): boolean {
  if (
    scope.projectId === null ||
    scope.chapterAssignmentId === null ||
    !isRegisteredAccount(scope.accountId)
  ) {
    return false;
  }
  // ABA: active pointer must still be the scoped account.
  if (getActiveUserId() !== scope.accountId) {
    return false;
  }
  return hasProjectObserverGrant(scope.accountId, scope.projectId);
}

function emptyStored(scope: LoadScope, loading: boolean): StoredState {
  return {
    scope,
    loading,
    hasAccess: false,
    accountId: scope.accountId,
    assignment: null,
    sourceVerses: [],
    draftUnits: [],
    unitChapters: [],
    bundleStatus: null,
  };
}

/**
 * Project stored state for the current render. Mismatched account / chapter /
 * project / epoch, revoked grant, or unregistered account hide content
 * synchronously — callers never see a prior scope's bundle between renders.
 */
function projectVisibleState(
  stored: StoredState,
  live: LoadScope,
): Omit<ObserverDraftChapterState, 'refresh'> {
  if (!scopesMatch(stored.scope, live) || !scopeHasLiveGrant(live)) {
    return {
      loading: false,
      hasAccess: false,
      accountId: live.accountId,
      assignment: null,
      sourceVerses: [],
      draftUnits: [],
      unitChapters: [],
      bundleStatus: null,
    };
  }
  const { scope: _scope, ...visible } = stored;
  return visible;
}

/**
 * Local-only Observer chapter loader. Never starts downloads — refreshes from
 * published getDraftChapterLocalBundle + existing assignment queries.
 */
export function useObserverDraftChapter(input: {
  chapterAssignmentId: number | null;
  projectId: number | null;
}): ObserverDraftChapterState {
  const { userSwitchEpoch } = useAuthSession();
  const userSwitchEpochRef = useRef(userSwitchEpoch);
  userSwitchEpochRef.current = userSwitchEpoch;
  const inputRef = useRef(input);
  inputRef.current = input;

  const [refreshKey, setRefreshKey] = useState(0);
  const [stored, setStored] = useState<StoredState>(() =>
    emptyStored(
      readLiveScope({
        chapterAssignmentId: null,
        projectId: null,
        userSwitchEpoch: 0,
      }),
      false,
    ),
  );

  const refresh = useCallback(() => {
    setRefreshKey(key => key + 1);
  }, []);

  const liveScope = readLiveScope({
    chapterAssignmentId: input.chapterAssignmentId,
    projectId: input.projectId,
    userSwitchEpoch,
  });

  const readCurrentScope = useCallback(
    (chapterAssignmentId: number | null, projectId: number | null): LoadScope =>
      readLiveScope({
        chapterAssignmentId,
        projectId,
        userSwitchEpoch: userSwitchEpochRef.current,
      }),
    [],
  );

  useEffect(() => {
    const chapterAssignmentId = input.chapterAssignmentId;
    const projectId = input.projectId;
    const loadScope = readCurrentScope(chapterAssignmentId, projectId);

    if (chapterAssignmentId === null || projectId === null) {
      setStored(emptyStored(loadScope, false));
      return;
    }

    if (!scopeHasLiveGrant(loadScope)) {
      setStored(emptyStored(loadScope, false));
      return;
    }

    let cancelled = false;
    setStored(emptyStored(loadScope, true));

    const load = async () => {
      const access = await resolveObserverDraftChapterAccess({
        chapterAssignmentId,
        projectId,
      });
      if (cancelled) {
        return;
      }
      const scopeAfterAccess = readCurrentScope(chapterAssignmentId, projectId);
      if (
        !access.ok ||
        !scopesMatch(loadScope, scopeAfterAccess) ||
        !scopeHasLiveGrant(scopeAfterAccess)
      ) {
        setStored(emptyStored(scopeAfterAccess, false));
        return;
      }

      const bundle = await loadObserverDraftLocalBundle({
        userIdNumber: access.userIdNumber,
        assignment: access.assignment,
      });
      if (cancelled) {
        return;
      }

      const scopeAfterBundle = readCurrentScope(chapterAssignmentId, projectId);
      if (
        !scopesMatch(loadScope, scopeAfterBundle) ||
        !scopeHasLiveGrant(scopeAfterBundle) ||
        scopeAfterBundle.accountId !== access.userId
      ) {
        setStored(emptyStored(scopeAfterBundle, false));
        return;
      }

      const [sourceVerses, unitChapters] = await Promise.all([
        loadObserverSourceVerses({
          assignment: access.assignment,
          bundle,
        }),
        listObserverUnitChapters(access.assignment.projectUnitId),
      ]);
      if (cancelled) {
        return;
      }

      const scopeFinal = readCurrentScope(chapterAssignmentId, projectId);
      if (
        !scopesMatch(loadScope, scopeFinal) ||
        !scopeHasLiveGrant(scopeFinal) ||
        scopeFinal.accountId !== access.userId
      ) {
        setStored(emptyStored(scopeFinal, false));
        return;
      }

      setStored({
        scope: loadScope,
        loading: false,
        hasAccess: true,
        accountId: scopeFinal.accountId,
        assignment: access.assignment,
        sourceVerses,
        draftUnits: mapUnits(bundle),
        unitChapters,
        bundleStatus: bundle?.status ?? null,
      });
    };

    void load().catch(() => {
      if (!cancelled) {
        setStored(
          emptyStored(readCurrentScope(chapterAssignmentId, projectId), false),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    input.chapterAssignmentId,
    input.projectId,
    userSwitchEpoch,
    refreshKey,
    readCurrentScope,
  ]);

  useEffect(() => {
    const onChange = () => {
      refresh();
    };
    const offQueue = onDownloadQueueChanged(onChange);
    const offSync = onSyncComplete(onChange);
    const offReauth = onAuthReauthRequired(() => {
      const current = inputRef.current;
      setStored(
        emptyStored(
          readCurrentScope(current.chapterAssignmentId, current.projectId),
          false,
        ),
      );
      refresh();
    });
    return () => {
      offQueue();
      offSync();
      offReauth();
    };
  }, [refresh, readCurrentScope]);

  return { ...projectVisibleState(stored, liveScope), refresh };
}
