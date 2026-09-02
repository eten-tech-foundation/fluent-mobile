import {
  clearDraftingUnitDirty,
  getDraftingUnit,
  isDraftingUnitDirty,
  notifyDraftingUnitChanged,
  setDraftingUnit,
  subscribeToDraftingUnit,
} from './draftingUnitPreference';
import { kvStorage } from './storage';

jest.mock('./storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  },
}));

const mockGetItemSync = kvStorage.getItemSync as jest.Mock;
const mockSetItemSync = kvStorage.setItemSync as jest.Mock;
const mockRemoveItemSync = kvStorage.removeItemSync as jest.Mock;

describe('draftingUnitPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemSync.mockReturnValue(null);
  });

  describe('getDraftingUnit', () => {
    it('returns verse by default when nothing is stored', () => {
      expect(getDraftingUnit('user1')).toBe('verse');
    });

    it('returns the stored value for the given user', () => {
      mockGetItemSync.mockImplementation((key: string) =>
        key === 'user1:drafting_unit' ? 'pericope' : null,
      );
      expect(getDraftingUnit('user1')).toBe('pericope');
    });

    it('returns default for an empty userId', () => {
      expect(getDraftingUnit('')).toBe('verse');
      expect(mockGetItemSync).not.toHaveBeenCalled();
    });

    it('falls back to default on an unrecognized stored value', () => {
      mockGetItemSync.mockReturnValue('not-a-real-unit');
      expect(getDraftingUnit('user1')).toBe('verse');
    });
  });

  describe('setDraftingUnit', () => {
    it('persists the unit and marks it dirty', () => {
      setDraftingUnit('pericope', 'user1');

      expect(mockSetItemSync).toHaveBeenCalledWith(
        'user1:drafting_unit',
        'pericope',
      );
      expect(mockSetItemSync).toHaveBeenCalledWith(
        'user1:drafting_unit_dirty',
        'true',
      );
    });

    it('does nothing for an empty userId', () => {
      setDraftingUnit('pericope', '');
      expect(mockSetItemSync).not.toHaveBeenCalled();
    });

    it('scopes storage per user', () => {
      setDraftingUnit('pericope', 'user1');
      setDraftingUnit('verse', 'user2');

      expect(mockSetItemSync).toHaveBeenCalledWith(
        'user1:drafting_unit',
        'pericope',
      );
      expect(mockSetItemSync).toHaveBeenCalledWith(
        'user2:drafting_unit',
        'verse',
      );
    });
  });

  describe('isDraftingUnitDirty / clearDraftingUnitDirty', () => {
    it('reports dirty after a write', () => {
      mockGetItemSync.mockImplementation((key: string) =>
        key === 'user1:drafting_unit_dirty' ? 'true' : null,
      );
      expect(isDraftingUnitDirty('user1')).toBe(true);
    });

    it('reports not dirty when unset', () => {
      expect(isDraftingUnitDirty('user1')).toBe(false);
    });

    it('returns false for an empty userId', () => {
      expect(isDraftingUnitDirty('')).toBe(false);
      expect(mockGetItemSync).not.toHaveBeenCalled();
    });

    it('clears the dirty flag', () => {
      clearDraftingUnitDirty('user1');
      expect(mockRemoveItemSync).toHaveBeenCalledWith(
        'user1:drafting_unit_dirty',
      );
    });

    it('does nothing for an empty userId', () => {
      clearDraftingUnitDirty('');
      expect(mockRemoveItemSync).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToDraftingUnit / notifyDraftingUnitChanged', () => {
    it('notifies subscribed listeners', () => {
      const listener = jest.fn();
      subscribeToDraftingUnit(listener);

      notifyDraftingUnitChanged();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeToDraftingUnit(listener);
      unsubscribe();

      notifyDraftingUnitChanged();

      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies on setDraftingUnit', () => {
      const listener = jest.fn();
      subscribeToDraftingUnit(listener);

      setDraftingUnit('pericope', 'user1');

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
