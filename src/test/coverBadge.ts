import { fireEvent, screen } from '@testing-library/react-native';

/** Lays a cover face out at the width its sizes are drawn for, so its badge draws. */
export function measureFace(testID: string): void {
  fireEvent(screen.getByTestId(testID), 'layout', {
    nativeEvent: { layout: { width: 165, height: 165 } },
  });
}

/** How much of the drawn badge's ring is filled, 0–1. */
export function ringFill(): number {
  const arc = screen.getByTestId('cover-badge-arc', {
    includeHiddenElements: true,
  });
  const [circumference = 0] = String(arc.props.strokeDasharray)
    .split(/[ ,]+/)
    .map(Number);
  // react-native-svg drops a zero offset.
  return 1 - (arc.props.strokeDashoffset ?? 0) / circumference;
}
