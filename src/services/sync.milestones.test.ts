import { FluentAPI } from './api';
import { syncMilestones } from './sync';
import { ApiError } from '../types/api/errors';
import { clearSyncError, setSyncError } from './storage';
import { upsertProjectUnits } from '../db/repository';

jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getUserMilestones: jest.fn(),
  },
}));

jest.mock('./keychain', () => ({
  clearCredentials: jest.fn().mockResolvedValue(undefined),
  getCredentials: jest.fn(),
  getTempCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  clearTempCredentials: jest.fn(),
}));

jest.mock('./storage', () => ({
  KV_KEYS: {
    SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
  },
  setSyncError: jest.fn(),
  clearSyncError: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  upsertProjectUnits: jest.fn().mockResolvedValue(undefined),
}));

const getUserMilestonesMock = FluentAPI.getUserMilestones as jest.Mock;
const upsertProjectUnitsMock = upsertProjectUnits as jest.Mock;
const setSyncErrorMock = setSyncError as jest.Mock;
const clearSyncErrorMock = clearSyncError as jest.Mock;

describe('syncMilestones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts milestones and clears the project-units sync error', async () => {
    getUserMilestonesMock.mockResolvedValue([
      { id: 12, name: 'Mark', projectId: 3, projectName: 'Baka NT' },
    ]);

    await syncMilestones(247, 'session-token');

    expect(getUserMilestonesMock).toHaveBeenCalledWith(247, 'session-token');
    expect(upsertProjectUnitsMock).toHaveBeenCalledWith([
      { id: 12, projectId: 3, name: 'Mark' },
    ]);
    expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_project_units');
    expect(setSyncErrorMock).not.toHaveBeenCalled();
  });

  it('soft-fails on 404 without storing a sync error', async () => {
    getUserMilestonesMock.mockRejectedValue(new ApiError(404, 'Not Found'));

    await expect(syncMilestones(247, 'session-token')).resolves.toBeUndefined();

    expect(upsertProjectUnitsMock).not.toHaveBeenCalled();
    expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_project_units');
    expect(setSyncErrorMock).not.toHaveBeenCalled();
  });
});
