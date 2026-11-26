import { renderHook } from '@testing-library/react-native';
import { useLaunchEntry } from './useLaunchEntry';

describe('useLaunchEntry', () => {
  it('is true on the launch route and on the render that enters a group', async () => {
    const { result, rerender } = await renderHook(
      ({ inGroup }: { inGroup: boolean }) => useLaunchEntry(inGroup),
      { initialProps: { inGroup: false } },
    );
    expect(result.current).toBe(true);

    await rerender({ inGroup: false });
    expect(result.current).toBe(true);

    await rerender({ inGroup: true });
    expect(result.current).toBe(true);
  });

  it('is false once a render inside a group has committed', async () => {
    const { result, rerender } = await renderHook(
      ({ inGroup }: { inGroup: boolean }) => useLaunchEntry(inGroup),
      { initialProps: { inGroup: true } },
    );
    expect(result.current).toBe(true);

    await rerender({ inGroup: true });
    expect(result.current).toBe(false);

    await rerender({ inGroup: false });
    expect(result.current).toBe(false);

    await rerender({ inGroup: true });
    expect(result.current).toBe(false);
  });
});
