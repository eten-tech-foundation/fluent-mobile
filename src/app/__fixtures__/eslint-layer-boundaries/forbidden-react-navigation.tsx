/**
 * Intentional ESLint violation fixture (#366). Ignored by default lint;
 * exercised by scripts/eslint-layer-boundaries.test.cjs.
 */
import { useNavigation } from '@react-navigation/native';

export function badUiNavigation(): void {
  void useNavigation;
}
