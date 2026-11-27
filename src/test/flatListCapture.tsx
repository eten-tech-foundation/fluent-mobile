import type { FlatListProps } from 'react-native';

/**
 * A FlatList that keeps its latest props. Callbacks such as
 * `onScrollToIndexFailed` are consumed by the list and never reach its host
 * element, so tests that drive them read them from here. It subclasses the real
 * list, so `FlatList.prototype` spies still apply. Mock the module with:
 *
 *   jest.mock('react-native/Libraries/Lists/FlatList', () => ({
 *     __esModule: true,
 *     default: require('../test/flatListCapture').CapturingFlatList,
 *   }));
 */
const ActualFlatList = jest.requireActual(
  'react-native/Libraries/Lists/FlatList',
).default;

let latest: FlatListProps<unknown> | null = null;

export class CapturingFlatList extends ActualFlatList {
  render() {
    latest = this.props as FlatListProps<unknown>;
    return super.render();
  }
}

/** Props of the most recently rendered FlatList. */
export function lastFlatListProps(): FlatListProps<unknown> {
  if (!latest) throw new Error('No FlatList has rendered');
  return latest;
}
