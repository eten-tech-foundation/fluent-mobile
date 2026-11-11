import type React from 'react';
import { AttentionCardEntry } from './AttentionCardEntry';
import { BannerEntry } from './BannerEntry';
import { BottomSheetEntry } from './BottomSheetEntry';
import { DialogEntry } from './DialogEntry';
import { HardwarePanelEntry } from './HardwarePanelEntry';
import { HomeHeaderEntry } from './HomeHeaderEntry';
import { IconsEntry } from './IconsEntry';
import { KeyEntry } from './KeyEntry';
import { NoteEntry } from './NoteEntry';
import { PassageCoverEntry } from './PassageCoverEntry';
import { PassageNoticesEntry } from './PassageNoticesEntry';
import { RoundButtonEntry } from './RoundButtonEntry';
import { ScreenHeaderEntry } from './ScreenHeaderEntry';
import { SwitchEntry } from './SwitchEntry';
import { TakeFanEntry } from './TakeFanEntry';
import { TypeEntry } from './TypeEntry';
import { WaveformEntry } from './WaveformEntry';
import { WordEntry } from './WordEntry';

/** The gallery's sections, in the order it shows them. */
export const gallerySections = [
  'Foundations',
  'Controls',
  'Player',
  'Cards and covers',
  'Notices',
  'Sheets and dialogs',
  'Headers',
] as const;

export type GallerySection = (typeof gallerySections)[number];

export interface GalleryEntry {
  id: string;
  name: string;
  section: GallerySection;
  /** Foundations modes the component is designed for. */
  modes: string;
  /** Live demos only: real interactions, no static state grids. */
  Component: React.ComponentType;
}

/** One entry per Next component — see docs/guides/figma-to-component.md step 7. */
export const galleryEntries: GalleryEntry[] = [
  {
    // Figma: Foundations · 03 Type (families still placeholders there)
    id: 'type',
    name: 'Type styles',
    section: 'Foundations',
    modes: 'Hardware · Canvas · Accent',
    Component: TypeEntry,
  },
  {
    // No Figma component: every icon in components/ui/icons.tsx.
    id: 'icons',
    name: 'Icons',
    section: 'Foundations',
    modes: 'Hardware · Canvas · Accent',
    Component: IconsEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-34
    id: 'key',
    name: 'Key',
    section: 'Controls',
    modes: 'Hardware',
    Component: KeyEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-41
    // Used as the Mode toggle: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-538
    id: 'switch',
    name: 'Switch · Mode toggle',
    section: 'Controls',
    modes: 'Hardware',
    Component: SwitchEntry,
  },
  {
    // Figma: Round button https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-64
    // Figma: Progress ring https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2400-302
    id: 'round-button',
    name: 'Round button · Progress ring',
    section: 'Controls',
    modes: 'Soft on Hardware screens · Flat on the Canvas hero and player',
    Component: RoundButtonEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2411-529
    // Mode toggle 2409-538 and Speaker grill 2409-533 are drawn inside it.
    id: 'hardware-panel',
    name: 'Hardware panel · Player keys',
    section: 'Controls',
    modes: 'Hardware',
    Component: HardwarePanelEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-505
    // Verse chip 2409-502
    id: 'waveform',
    name: 'Waveform · Verse chips',
    section: 'Player',
    modes: 'Canvas (the player)',
    Component: WaveformEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-495
    // In the player: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2440-30858
    id: 'word',
    name: 'Word · Phrase chips',
    section: 'Player',
    modes: 'Canvas (the player)',
    Component: WordEntry,
  },
  {
    // Figma: Understanding screen https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2440-31081
    // Page dot https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-508
    id: 'note',
    name: 'Translation note · Page dots',
    section: 'Player',
    modes: 'Accent (the note) · Hardware (keys)',
    Component: NoteEntry,
  },
  {
    // Figma: Take fan https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2555-743
    // Take card 2555-910 · deleted take card 2557-1257
    id: 'take-fan',
    name: 'Take fan · Take card',
    section: 'Player',
    modes: 'Canvas (Record)',
    Component: TakeFanEntry,
  },
  {
    // No Figma component: built from Foundations tokens for the book page.
    id: 'passage-cover',
    name: 'Passage cover',
    section: 'Cards and covers',
    modes: 'Hardware (book page)',
    Component: PassageCoverEntry,
  },
  {
    // No Figma component yet: modeled on desktop's Community notes card.
    id: 'attention-card',
    name: 'Attention card',
    section: 'Cards and covers',
    modes: 'Hardware (Home)',
    Component: AttentionCardEntry,
  },
  {
    // Figma: Gap / Banner https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-62
    // On Home · Session expired: 2646-143
    id: 'banner',
    name: 'Banner',
    section: 'Notices',
    modes: 'Hardware (Home)',
    Component: BannerEntry,
  },
  {
    // No Figma component: Legacy's Record-tab banners in Next's type.
    id: 'passage-notices',
    name: 'Passage notices',
    section: 'Notices',
    modes: 'Canvas (the player footer and the passage hero)',
    Component: PassageNoticesEntry,
  },
  {
    // Figma: Home · Accounts sheet https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2646-166
    // Gap / List row 2644-51
    id: 'bottom-sheet',
    name: 'Bottom sheet · List row',
    section: 'Sheets and dialogs',
    modes: 'Hardware (Home)',
    Component: BottomSheetEntry,
  },
  {
    // Figma: Gap / Dialog https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-72
    // As the player's take confirm (the Figma frame is the send confirm 2648-616)
    id: 'dialog',
    name: 'Dialog',
    section: 'Sheets and dialogs',
    modes: 'Hardware',
    Component: DialogEntry,
  },
  {
    // No Figma component: the header row on Home, the book page and the
    // note, with a soft stroke once the content scrolls under it.
    id: 'screen-header',
    name: 'Screen header',
    section: 'Headers',
    modes: 'Hardware (Home, book page) · Accent (note)',
    Component: ScreenHeaderEntry,
  },
  {
    // Figma: Gap / Avatar https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-70
    // In the Home header with the sync Round button: 2646-52
    id: 'home-header',
    name: 'Avatar · Sync status button',
    section: 'Headers',
    modes: 'Hardware (Home)',
    Component: HomeHeaderEntry,
  },
];
