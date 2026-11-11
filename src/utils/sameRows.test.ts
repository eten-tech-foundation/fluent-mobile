import { sameRows } from './sameRows';

describe('sameRows', () => {
  it('matches lists with equal rows in the same order', () => {
    expect(
      sameRows(
        [{ id: 1, name: 'a', at: undefined }],
        [{ id: 1, name: 'a', at: undefined }],
      ),
    ).toBe(true);
    expect(sameRows([], [])).toBe(true);
  });

  it('differs on any changed field, order, length or field set', () => {
    expect(sameRows([{ id: 1, n: 2 }], [{ id: 1, n: 3 }])).toBe(false);
    expect(sameRows([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }])).toBe(
      false,
    );
    expect(sameRows([{ id: 1 }], [{ id: 1 }, { id: 2 }])).toBe(false);
    expect(
      sameRows<{ id: number; at?: string }>([{ id: 1 }], [{ id: 1, at: 'x' }]),
    ).toBe(false);
  });
});
