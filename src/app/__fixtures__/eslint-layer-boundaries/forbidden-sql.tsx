/**
 * Intentional ESLint violation fixture (#366). Ignored by default lint;
 * exercised by scripts/eslint-layer-boundaries.test.cjs.
 */
import { getDatabase } from '../../../db/db';

export function badUiGetDatabase(): void {
  void getDatabase();
}

export function badUiExecuteSql(): void {
  const fakeDb = {
    executeSql(_sql: string): void {
      /* intentional */
    },
  };
  fakeDb.executeSql('SELECT 1');
}
