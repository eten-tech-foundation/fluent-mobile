import { screen } from '@testing-library/react-native';

/** A rendered host element, as RNTL returns it. */
export type HostInstance = NonNullable<typeof screen.root>;

/**
 * Host elements of a native type (e.g. `RCTSwitch`, `Image`, `RCTScrollView`),
 * in render order. RNTL 14 renders host elements only, so composite components
 * such as `Switch` or `FlatList` are found by the host type they render.
 */
export function getAllByHostType(type: string): HostInstance[] {
  const found: HostInstance[] = [];
  const visit = (node: HostInstance | string) => {
    if (typeof node === 'string') return;
    if (node.type === type) found.push(node);
    node.children.forEach(visit);
  };
  // The container holds every top-level element; `root` is only the first.
  if (screen.container) visit(screen.container);
  return found;
}

/** The single host element of a native type; throws unless there is exactly one. */
export function getByHostType(type: string): HostInstance {
  const found = getAllByHostType(type);
  if (found.length !== 1) {
    throw new Error(
      `Expected one host element of type ${type}, found ${found.length}`,
    );
  }
  return found[0];
}
