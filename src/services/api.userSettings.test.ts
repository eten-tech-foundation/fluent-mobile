jest.mock('./connectivity', () => ({
  checkServerReachable: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';

describe('FluentAPI user settings (#754)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
    authToken.set('global-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    authToken.set(null);
  });

  it('getSelfSettings uses explicit bearer without mutating global token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          settings: { displayMode: 'pericope' },
          updatedAt: '2026-01-01T00:00:00.000Z',
          settingsCapabilities: { partialMerge: true, displayMode: true },
        }),
      headers: { get: () => null },
    });

    const result = await FluentAPI.getSelfSettings('account-token');

    expect(result.settings?.displayMode).toBe('pericope');
    expect(result.settingsCapabilities).toEqual({
      partialMerge: true,
      displayMode: true,
    });
    expect(authToken.get()).toBe('global-token');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer account-token');
  });

  it('putSelfSettings sends partial displayMode body with explicit bearer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          settings: { displayMode: 'verse', keep: true },
          updatedAt: '2026-01-02T00:00:00.000Z',
          settingsCapabilities: { partialMerge: true, displayMode: true },
        }),
      headers: { get: () => null },
    });

    const result = await FluentAPI.putSelfSettings(
      { settings: { displayMode: 'verse' } },
      'account-token',
    );

    expect(result.settings?.keep).toBe(true);
    expect(result.settingsCapabilities?.partialMerge).toBe(true);
    expect(authToken.get()).toBe('global-token');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/self/settings');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer account-token');
    expect(JSON.parse(init.body)).toEqual({
      settings: { displayMode: 'verse' },
    });
  });

  it('putSelfSettings supports displayMode null reset body; normalize omits key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          settings: { other: 1 },
          updatedAt: '2026-01-03T00:00:00.000Z',
          settingsCapabilities: { partialMerge: true, displayMode: true },
        }),
      headers: { get: () => null },
    });

    const result = await FluentAPI.putSelfSettings(
      { settings: { displayMode: null } },
      'account-token',
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      settings: { displayMode: null },
    });
    expect(result.settings).toEqual({ other: 1 });
    expect(result.settings).not.toHaveProperty('displayMode');
    expect(result.settingsCapabilities).toEqual({
      partialMerge: true,
      displayMode: true,
    });
  });
});
