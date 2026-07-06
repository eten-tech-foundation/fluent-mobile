export enum DraftingTab {
  Bible = 'bible',
  Record = 'record',
}

export enum GuardContext {
  Verse = 'verse',
  Tab = 'tab',
  Leave = 'leave',
}

export type TabSwitchGuard = (action: () => void) => void;

export interface TabSwitchGuardRef {
  current: TabSwitchGuard | null;
}
