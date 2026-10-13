import type React from 'react';
import { KeyEntry } from './KeyEntry';
import { ProgressDotsEntry } from './ProgressDotsEntry';
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
    id: 'switch',
    name: 'Switch',
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
    id: 'progress-dots',
    name: 'Progress dots',
    modes: 'Hardware (Pericope header)',
    Component: ProgressDotsEntry,
  },
];
