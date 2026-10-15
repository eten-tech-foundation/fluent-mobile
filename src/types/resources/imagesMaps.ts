/** Aquifer image/map item for the Resources tab (#191). */
export interface ImagesMapsItem {
  id: string;
  title: string;
  /** Optional caption under the title. */
  caption?: string;
  /** Attribution / credit line; omit when unavailable. */
  attribution?: string;
  /**
   * Full-resolution URL (fullscreen). List thumbnails prefer
   * `thumbnailUri` when set (#594).
   */
  uri: string;
  /** Smaller preview URL for the list; falls back to `uri`. */
  thumbnailUri?: string;
}
