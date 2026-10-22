import type React from 'react';
import { HardwarePanelEntry } from './HardwarePanelEntry';
import { KeyEntry } from './KeyEntry';
import { LevelWaveEntry } from './LevelWaveEntry';
import { RoundButtonEntry } from './RoundButtonEntry';
import { SwitchEntry } from './SwitchEntry';
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
];
