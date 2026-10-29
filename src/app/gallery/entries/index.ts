import type React from 'react';
import { AttentionCardEntry } from './AttentionCardEntry';
import { BannerEntry } from './BannerEntry';
import { BottomSheetEntry } from './BottomSheetEntry';
import { DialogEntry } from './DialogEntry';
import { HardwarePanelEntry } from './HardwarePanelEntry';
import { HomeHeaderEntry } from './HomeHeaderEntry';
import { KeyEntry } from './KeyEntry';
import { LevelWaveEntry } from './LevelWaveEntry';
import { PassageCoverEntry } from './PassageCoverEntry';
import { RoundButtonEntry } from './RoundButtonEntry';
import { SwitchEntry } from './SwitchEntry';
import { TrackRowEntry } from './TrackRowEntry';
import { WaveformEntry } from './WaveformEntry';

export interface GalleryEntry {
  id: string;
  name: string;
  /** Foundations modes the component is designed for. */
  modes: string;
  /** Live demos only: real interactions, no static state grids. */
  Component: React.ComponentType;
}

/** One entry per Next component — see docs/guides/figma-to-component.md step 7. */
export const galleryEntries: GalleryEntry[] = [
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-34
    id: 'key',
    name: 'Key',
    modes: 'Hardware',
    Component: KeyEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-41
    // Used as the Mode toggle: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-538
    id: 'switch',
    name: 'Switch · Mode toggle',
    modes: 'Hardware',
    Component: SwitchEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-505
    // Verse chip 2409-502 · Page dot 2409-508
    id: 'waveform',
    name: 'Waveform · Page dots',
    modes: 'Canvas (the player)',
    Component: WaveformEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2409-509
    // Long: Recorder take card 2555-910
    id: 'level-wave',
    name: 'Level wave · Short and Long',
    modes: 'Hardware (header) · Canvas (take card)',
    Component: LevelWaveEntry,
  },
  {
    // Figma passage rows (Round button 2326-64 in Progress ring 2400-302),
    // with the button only on the live row.
    id: 'track-row',
    name: 'Track row',
    modes: 'Hardware (passage page)',
    Component: TrackRowEntry,
  },
  {
    // No Figma component: built from Foundations tokens for the book page.
    id: 'passage-cover',
    name: 'Passage cover',
    modes: 'Hardware (book page)',
    Component: PassageCoverEntry,
  },
  {
    // Figma: Round button https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-64
    // Figma: Progress ring https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2400-302
    id: 'round-button',
    name: 'Round button · Progress ring',
    modes: 'Soft in passage rows · Flat in the Canvas player header',
    Component: RoundButtonEntry,
  },
  {
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2411-529
    // Mode toggle 2409-538 and Speaker grill 2409-533 are drawn inside it.
    id: 'hardware-panel',
    name: 'Hardware panel',
    modes: 'Hardware',
    Component: HardwarePanelEntry,
  },
  {
    // Figma: Gap / Avatar https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-70
    // In the Home header with the sync Round button: 2646-52
    id: 'home-header',
    name: 'Avatar · Sync status button',
    modes: 'Hardware (Home)',
    Component: HomeHeaderEntry,
  },
  {
    // Figma: Gap / Banner https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-62
    // On Home · Session expired: 2646-143
    id: 'banner',
    name: 'Banner',
    modes: 'Hardware (Home)',
    Component: BannerEntry,
  },
  {
    // Figma: Home · Accounts sheet https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2646-166
    // Gap / List row 2644-51
    id: 'bottom-sheet',
    name: 'Bottom sheet · List row',
    modes: 'Hardware (Home)',
    Component: BottomSheetEntry,
  },
  {
    // No Figma component yet: modeled on desktop's Community notes card.
    id: 'attention-card',
    name: 'Attention card',
    modes: 'Hardware (Home)',
    Component: AttentionCardEntry,
  },
  {
    // Figma: Gap / Dialog https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2644-72
    // As the send confirm: Send to Peer Check · Confirm 2648-616
    id: 'dialog',
    name: 'Dialog',
    modes: 'Hardware (over the player)',
    Component: DialogEntry,
  },
];
