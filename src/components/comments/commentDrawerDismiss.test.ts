import {
  COMMENT_DRAWER_DISMISS_DY,
  COMMENT_DRAWER_DISMISS_VY,
  shouldDismissCommentDrawerDrag,
} from './commentDrawerDismiss';

describe('shouldDismissCommentDrawerDrag', () => {
  it('dismisses when dy crosses the threshold', () => {
    expect(shouldDismissCommentDrawerDrag(COMMENT_DRAWER_DISMISS_DY, 0)).toBe(
      true,
    );
    expect(
      shouldDismissCommentDrawerDrag(COMMENT_DRAWER_DISMISS_DY - 1, 0),
    ).toBe(false);
  });

  it('dismisses when vy crosses the threshold', () => {
    expect(shouldDismissCommentDrawerDrag(0, COMMENT_DRAWER_DISMISS_VY)).toBe(
      true,
    );
    expect(
      shouldDismissCommentDrawerDrag(0, COMMENT_DRAWER_DISMISS_VY - 0.01),
    ).toBe(false);
  });
});
