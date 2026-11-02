import { FluentAPI } from './api';
import {
  __resetSourceLanguageIsoEnsureForTests,
  ensureSourceLanguageIso,
  releaseSourceLanguageIsoEnsure,
} from './sync';
import { ApiError } from '../types/api/errors';
import { emitSyncComplete, emitSyncStart } from './syncEvents';

jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getLanguages: jest.fn(),
    getBooks: jest.fn(),
    getBibles: jest.fn(),
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
  KV_KEYS: { SYNC_ERROR_MASTER_DATA: 'sync_error_master_data' },
  setSyncError: jest.fn(),
  clearSyncError: jest.fn(),
  getMasterDataUpdatedAt: jest.fn(() => null),
  setMasterDataUpdatedAt: jest.fn(),
}));

jest.mock('./syncEvents', () => ({
  emitSyncStart: jest.fn(),
  emitSyncComplete: jest.fn(),
  emitAuthReauthRequired: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  insertMasterData: jest.fn().mockResolvedValue(undefined),
}));

const getLanguages = FluentAPI.getLanguages as jest.Mock;

describe('ensureSourceLanguageIso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetSourceLanguageIsoEnsureForTests();
    getLanguages.mockResolvedValue([]);
    (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);
  });

  it('pulls every language once per project, like Legacy drafting', async () => {
    const readCode = jest.fn(async () => 'eng');

    await expect(ensureSourceLanguageIso(9, readCode)).resolves.toBe(true);
    await expect(ensureSourceLanguageIso(9, readCode)).resolves.toBe(false);

    expect(getLanguages).toHaveBeenCalledTimes(1);
    expect(getLanguages).toHaveBeenCalledWith(undefined, undefined);
    expect(emitSyncStart).toHaveBeenCalledTimes(1);
    expect(emitSyncComplete).toHaveBeenCalledTimes(1);
  });

  it('does not pull again while the screen is still open and the code is blank', async () => {
    const readCode = jest.fn(async () => '  ');

    await ensureSourceLanguageIso(9, readCode);
    await ensureSourceLanguageIso(9, readCode);

    expect(getLanguages).toHaveBeenCalledTimes(1);

    releaseSourceLanguageIsoEnsure(9);
    await ensureSourceLanguageIso(9, readCode);
    expect(getLanguages).toHaveBeenCalledTimes(2);
  });

  it('does not pull again until the next open when the pull fails', async () => {
    getLanguages.mockRejectedValueOnce(new ApiError(400, 'Bad Request'));
    const readCode = jest.fn(async () => 'eng');

    await expect(ensureSourceLanguageIso(9, readCode)).resolves.toBe(false);
    expect(emitSyncComplete).toHaveBeenCalledTimes(1);
    await expect(ensureSourceLanguageIso(9, readCode)).resolves.toBe(false);
    expect(getLanguages).toHaveBeenCalledTimes(1);

    releaseSourceLanguageIsoEnsure(9);
    await expect(ensureSourceLanguageIso(9, readCode)).resolves.toBe(true);
    expect(readCode).toHaveBeenCalledTimes(1);
  });
});
