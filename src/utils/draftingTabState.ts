import { DraftingTab } from '../components/layout/DraftingTabBar';

const lastActiveTabByChapter = new Map<number, DraftingTab>();

export function getLastActiveTab(chapterId: number): DraftingTab | undefined {
  return lastActiveTabByChapter.get(chapterId);
}

export function setLastActiveTab(chapterId: number, tab: DraftingTab): void {
  lastActiveTabByChapter.set(chapterId, tab);
}
