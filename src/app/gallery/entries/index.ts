import type React from 'react';
import { KeyEntry } from './KeyEntry';
import { RoundButtonEntry } from './RoundButtonEntry';
import { SwitchEntry } from './SwitchEntry';

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
    // Figma: Round button https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2326-64
    // Figma: Progress ring https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2400-302
    id: 'round-button',
    name: 'Round button · Progress ring',
    modes: 'Soft on light screens · Flat pinned to Canvas',
    Component: RoundButtonEntry,
  },
];
