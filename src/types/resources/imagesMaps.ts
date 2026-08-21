/** Aquifer image/map item for the Resources tab (#191). */
export interface ImagesMapsItem {
  id: string;
  title: string;
  /** Optional caption under the title. */
  caption?: string;
  /** Attribution / credit line; omit when unavailable. */
  attribution?: string;
  /** Remote URL or local file URI. */
  uri: string;
}
