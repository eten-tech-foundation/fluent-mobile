import { getActiveUserId, kvStorage } from './storage';

export type DraftingUnit = 'verse' | 'pericope';

const DEFAULT_DRAFTING_UNIT: DraftingUnit = 'verse';

const draftingUnitKey = (userId: string) => `${userId}:drafting_unit`;
const draftingUnitDirtyKey = (userId: string) =>
  `${userId}:drafting_unit_dirty`;

type DraftingUnitListener = () => void;

const listeners: DraftingUnitListener[] = [];

function isDraftingUnit(value: string | undefined): value is DraftingUnit {
  return value === 'verse' || value === 'pericope';
}

export function getDraftingUnit(
  userId: string = getActiveUserId(),
): DraftingUnit {
  if (!userId) return DEFAULT_DRAFTING_UNIT;
  const raw = kvStorage.getItemSync(draftingUnitKey(userId)) ?? undefined;
  return isDraftingUnit(raw) ? raw : DEFAULT_DRAFTING_UNIT;
}

export function setDraftingUnit(
  unit: DraftingUnit,
  userId: string = getActiveUserId(),
): void {
  if (!userId) return;
  kvStorage.setItemSync(draftingUnitKey(userId), unit);
  kvStorage.setItemSync(draftingUnitDirtyKey(userId), 'true');
  notifyDraftingUnitChanged();
}

export function isDraftingUnitDirty(
  userId: string = getActiveUserId(),
): boolean {
  if (!userId) return false;
  return kvStorage.getItemSync(draftingUnitDirtyKey(userId)) === 'true';
}

export function clearDraftingUnitDirty(
  userId: string = getActiveUserId(),
): void {
  if (!userId) return;
  kvStorage.removeItemSync(draftingUnitDirtyKey(userId));
}

export function subscribeToDraftingUnit(
  onStoreChange: DraftingUnitListener,
): () => void {
  listeners.push(onStoreChange);
  return () => {
    const index = listeners.indexOf(onStoreChange);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

export function notifyDraftingUnitChanged(): void {
  listeners.forEach(listener => listener());
}
