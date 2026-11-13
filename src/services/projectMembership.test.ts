const mockGetUserProjects = jest.fn();
jest.mock('./api', () => ({
  FluentAPI: {
    getUserProjects: (...args: unknown[]) => mockGetUserProjects(...args),
  },
}));

const mockGetCredentials = jest.fn();
jest.mock('./keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockInsertUserProjects = jest.fn();
const mockReconcileUserProjects = jest.fn();
const mockSelectExistingIds = jest.fn();
jest.mock('../db/repository', () => ({
  insertUserProjects: (...args: unknown[]) => mockInsertUserProjects(...args),
  reconcileUserProjects: (...args: unknown[]) =>
    mockReconcileUserProjects(...args),
  selectExistingIds: (...args: unknown[]) => mockSelectExistingIds(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: function (): void {},
      error: function (): void {},
      warn: function (): void {},
    }),
  },
}));

import { refreshProjectMembership } from './projectMembership';

describe('refreshProjectMembership (#848)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredentials.mockResolvedValue({ token: 'tok-1' });
    mockGetUserProjects.mockResolvedValue({ data: [{ id: 10 }, { id: 20 }] });
    mockSelectExistingIds.mockResolvedValue(new Set([10]));
    mockInsertUserProjects.mockResolvedValue(undefined);
    mockReconcileUserProjects.mockResolvedValue(undefined);
  });

  it('writes current memberships and drops the projects the account left', async () => {
    await refreshProjectMembership(1);

    expect(mockGetUserProjects).toHaveBeenCalledWith(1, 'tok-1');
    // Only cached projects may be inserted (FK parent row must exist).
    expect(mockInsertUserProjects).toHaveBeenCalledWith(1, [10]);
    // Every current id is kept; anything else for this user is deleted.
    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, [10, 20]);
  });

  it('uses the active account token rather than the global bearer', async () => {
    await refreshProjectMembership(2);

    expect(mockGetCredentials).toHaveBeenCalledWith('2');
    expect(mockGetUserProjects).toHaveBeenCalledWith(2, 'tok-1');
  });

  it('rejects without credentials so callers defer instead of uploading', async () => {
    mockGetCredentials.mockResolvedValue(null);

    await expect(refreshProjectMembership(1)).rejects.toThrow(
      'No credentials for user 1',
    );
    expect(mockGetUserProjects).not.toHaveBeenCalled();
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('rejects on an unexpected response shape without wiping cached membership', async () => {
    mockGetUserProjects.mockResolvedValue({ data: { message: 'nope' } });

    await expect(refreshProjectMembership(1)).rejects.toThrow(
      'Unexpected project membership response shape',
    );
    expect(mockInsertUserProjects).not.toHaveBeenCalled();
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('propagates a transport failure', async () => {
    mockGetUserProjects.mockRejectedValue(new Error('network down'));

    await expect(refreshProjectMembership(1)).rejects.toThrow('network down');
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('drops an empty membership answer so every take holds', async () => {
    mockGetUserProjects.mockResolvedValue({ data: [] });
    mockSelectExistingIds.mockResolvedValue(new Set());

    await refreshProjectMembership(1);

    expect(mockInsertUserProjects).toHaveBeenCalledWith(1, []);
    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, []);
  });

  it('ignores ids that are not positive numbers', async () => {
    mockGetUserProjects.mockResolvedValue({
      data: [{ id: 10 }, { id: 10 }, { id: 0 }, { id: null }, { nope: true }],
    });

    await refreshProjectMembership(1);

    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, [10]);
  });

  it('rejects without an active user', async () => {
    await expect(refreshProjectMembership(null)).rejects.toThrow(
      'An active user is required',
    );
    expect(mockGetUserProjects).not.toHaveBeenCalled();
  });
});
