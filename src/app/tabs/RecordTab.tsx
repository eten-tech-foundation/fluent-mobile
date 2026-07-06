import React, { useEffect, useState } from 'react';
import { useDraftingContext } from '../context/DraftingContext';
import { getBibleTextId, getProjectIdForProjectUnit } from '../../db/queries';
import { getActiveUserId } from '../../services/storage';
import type { TabSwitchGuardRef } from '../../types/drafting/types';
import { RecordTab as RecordTabPanel } from './drafting/record/RecordTab';

export type { TabSwitchGuardRef } from '../../types/drafting/types';

interface RecordTabProps {
  tabSwitchGuardRef?: TabSwitchGuardRef;
}

/**
 * Record tab mount point for the drafting screen. Resolves recording metadata
 * from the chapter assignment and wires verse selection through DraftingContext.
 */
export function RecordTab({ tabSwitchGuardRef }: RecordTabProps = {}) {
  const {
    verses,
    selectedVerse,
    setSelectedVerse,
    chapterAssignment,
    bookDisplayName,
  } = useDraftingContext();

  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const userId = getActiveUserId();

  useEffect(() => {
    let cancelled = false;
    setBibleTextId(null);

    async function resolveId() {
      const id = await getBibleTextId(
        chapterAssignment.bibleId,
        chapterAssignment.bookId,
        chapterAssignment.chapterNumber,
        selectedVerse,
      );
      if (!cancelled) setBibleTextId(id);
    }

    resolveId();
    return () => {
      cancelled = true;
    };
  }, [chapterAssignment, selectedVerse]);

  useEffect(() => {
    let cancelled = false;

    async function resolveProjectId() {
      const id = await getProjectIdForProjectUnit(
        chapterAssignment.projectUnitId,
      );
      if (!cancelled) setProjectId(id);
    }

    resolveProjectId();
    return () => {
      cancelled = true;
    };
  }, [chapterAssignment.projectUnitId]);

  return (
    <RecordTabPanel
      bookName={bookDisplayName}
      chapterNumber={chapterAssignment.chapterNumber}
      verses={verses}
      selectedVerseNumber={selectedVerse}
      bibleTextIdForSelectedVerse={bibleTextId}
      onSelectVerse={setSelectedVerse}
      userId={userId}
      projectId={projectId}
      chapterAssignmentId={chapterAssignment.id}
      bookCode={chapterAssignment.bookCode ?? null}
      tabSwitchGuardRef={tabSwitchGuardRef}
    />
  );
}
