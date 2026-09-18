import { FluentAPI } from './api';
import { syncMilestones } from './sync';
import { ApiError } from '../types/api/errors';
import { clearSyncError, setSyncError } from './storage';
import { reconcileUserMilestones, upsertProjectUnits } from '../db/repository';

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
  reconcileUserMilestones: jest.fn().mockResolvedValue(undefined),
}));

const getUserMilestonesMock = FluentAPI.getUserMilestones as jest.Mock;
const upsertProjectUnitsMock = upsertProjectUnits as jest.Mock;
const reconcileUserMilestonesMock = reconcileUserMilestones as jest.Mock;
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
    expect(reconcileUserMilestonesMock).toHaveBeenCalledWith(247, [12]);
    expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_project_units');
    expect(setSyncErrorMock).not.toHaveBeenCalled();
  });

  it('records a sync error when the response is not an array', async () => {
    getUserMilestonesMock.mockResolvedValue({ data: {} });

    await syncMilestones(247, 'session-token');

    expect(upsertProjectUnitsMock).not.toHaveBeenCalled();
    expect(reconcileUserMilestonesMock).not.toHaveBeenCalled();
    expect(setSyncErrorMock).toHaveBeenCalledWith(
      'sync_error_project_units',
      'Invalid milestones response shape',
    );
    expect(clearSyncErrorMock).not.toHaveBeenCalled();
  });

  it('soft-fails on 404 without storing a sync error', async () => {
    getUserMilestonesMock.mockRejectedValue(new ApiError(404, 'Not Found'));

    await expect(syncMilestones(247, 'session-token')).resolves.toBeUndefined();

    expect(upsertProjectUnitsMock).not.toHaveBeenCalled();
    expect(reconcileUserMilestonesMock).not.toHaveBeenCalled();
    expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_project_units');
    expect(setSyncErrorMock).not.toHaveBeenCalled();
  });

  it('reconciles stale units when the API returns an empty milestone list', async () => {
    getUserMilestonesMock.mockResolvedValue([]);

    await syncMilestones(247, 'session-token');

    expect(upsertProjectUnitsMock).toHaveBeenCalledWith([]);
    expect(reconcileUserMilestonesMock).toHaveBeenCalledWith(247, []);
    expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_project_units');
  });
});
