/** Downward drag past this dy (or vy) dismisses the half-sheet. */
export const COMMENT_DRAWER_DISMISS_DY = 64;
export const COMMENT_DRAWER_DISMISS_VY = 0.85;

export function shouldDismissCommentDrawerDrag(
  dy: number,
  vy: number,
): boolean {
  return dy >= COMMENT_DRAWER_DISMISS_DY || vy >= COMMENT_DRAWER_DISMISS_VY;
}
