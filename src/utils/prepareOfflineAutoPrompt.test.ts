import { logger } from './logger';
import {
  createPrepareOfflineAutoPromptController,
  type PrepareOfflineAutoPromptDeps,
  type PrepareOfflineProjectCandidate,
} from './prepareOfflineAutoPrompt';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

const qualifyingProject: PrepareOfflineProjectCandidate = {
  id: 10,
  name: 'Alpha',
  connectivityProfile: 'rarely_connected',
};

function createDeps(
  overrides: Partial<PrepareOfflineAutoPromptDeps> = {},
): PrepareOfflineAutoPromptDeps & {
  present: jest.Mock;
  getProjects: jest.Mock;
  isAssigned: jest.Mock;
  hasDownloadStarted: jest.Mock;
} {
  const present = jest.fn();
  const getProjects = jest.fn(async () => [qualifyingProject]);
  const isAssigned = jest.fn(async () => true);
  const hasDownloadStarted = jest.fn(() => false);

  const deps: PrepareOfflineAutoPromptDeps & {
    present: jest.Mock;
    getProjects: jest.Mock;
    isAssigned: jest.Mock;
    hasDownloadStarted: jest.Mock;
  } = {
    isFocused: () => true,
    hasTransferResolved: () => true,
    isSettling: () => false,
    getTransport: () => ({
      isOnline: true,
      isWifi: true,
      uploadOverCellular: false,
      connectionType: 'wifi',
    }),
    getUserId: () => 42,
    getProjects,
    isAssigned,
    hasDownloadStarted,
    present,
  };

  Object.assign(deps, overrides);
  return deps;
}

describe('createPrepareOfflineAutoPromptController', () => {
  afterEach(() => {
    jest.clearAllMocks();
    logger.reset();
  });

  it('presents the triggering project when eligible', async () => {
    const deps = createDeps();
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();

    expect(deps.present).toHaveBeenCalledWith(qualifyingProject);
    expect(controller.getState().shownThisAppOpen).toBe(true);
  });

  it('defers while settling and retries once settling ends', async () => {
    let settling = true;
    const deps = createDeps({
      isSettling: () => settling,
    });
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();

    expect(deps.present).not.toHaveBeenCalled();
    expect(controller.getState().pendingAfterSettle).toBe(true);

    settling = false;
    controller.notifySettlingChanged();
    await flushMicrotasks();

    expect(deps.present).toHaveBeenCalledTimes(1);
    expect(controller.getState().pendingAfterSettle).toBe(false);
  });

  it('does not present again in the same app open until reset', async () => {
    const deps = createDeps();
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();
    expect(deps.present).toHaveBeenCalledTimes(1);

    controller.request();
    await flushMicrotasks();
    expect(deps.present).toHaveBeenCalledTimes(1);

    controller.resetShownThisAppOpen();
    controller.request();
    await flushMicrotasks();
    expect(deps.present).toHaveBeenCalledTimes(2);
  });

  it('queues a second request while in-flight instead of dropping it', async () => {
    const gate = deferred<PrepareOfflineProjectCandidate[]>();
    const present = jest.fn();
    const getProjects = jest
      .fn()
      // First in-flight call finds nothing; queued retry must still run.
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValueOnce([qualifyingProject]);

    const deps = createDeps({ getProjects, present });
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks(1);
    expect(controller.getState().inFlight).toBe(true);

    controller.request();
    await flushMicrotasks(1);
    expect(getProjects).toHaveBeenCalledTimes(1);

    gate.resolve([]);
    await flushMicrotasks(5);

    expect(getProjects).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenCalledWith(qualifyingProject);
  });

  it('logs project summary failures and does not set the shown gate', async () => {
    const mockTransport = jest.fn();
    logger.setTransport(mockTransport);

    const getProjects = jest
      .fn()
      .mockRejectedValueOnce(new Error('db too large'))
      .mockResolvedValueOnce([qualifyingProject]);

    const deps = createDeps({ getProjects });
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();

    expect(deps.present).not.toHaveBeenCalled();
    expect(controller.getState().shownThisAppOpen).toBe(false);
    expect(mockTransport).toHaveBeenCalledWith(
      'warn',
      'prepareOfflineAutoPrompt',
      'Project summary failed; will retry on next trigger',
      expect.objectContaining({ error: 'db too large' }),
    );

    controller.request();
    await flushMicrotasks();
    expect(deps.present).toHaveBeenCalledTimes(1);
  });

  it('skips when download already started for the project', async () => {
    const deps = createDeps({
      hasDownloadStarted: jest.fn(() => true),
    });
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();

    expect(deps.present).not.toHaveBeenCalled();
    expect(controller.getState().shownThisAppOpen).toBe(false);
  });

  it('does not present on cellular when the cellular toggle is off', async () => {
    const deps = createDeps({
      getTransport: () => ({
        isOnline: true,
        isWifi: false,
        uploadOverCellular: false,
        connectionType: 'cellular',
      }),
    });
    const controller = createPrepareOfflineAutoPromptController(deps);

    controller.request();
    await flushMicrotasks();

    expect(deps.present).not.toHaveBeenCalled();
  });
});
