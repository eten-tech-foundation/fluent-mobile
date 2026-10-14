import type React from 'react';
import { HardwarePanelEntry } from './HardwarePanelEntry';
import { KeyEntry } from './KeyEntry';
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
    // Figma: https://www.figma.com/design/VZ23XV2pxvIIAMn12wI4YI/ETEN-x-Fluent?node-id=2411-529
    // Mode toggle 2409-538 and Speaker grill 2409-533 are drawn inside it.
    id: 'hardware-panel',
    name: 'Hardware panel',
    modes: 'Hardware',
    Component: HardwarePanelEntry,
  },
];
