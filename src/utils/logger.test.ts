/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger, defaultTransport } from './logger';

describe('Logger', () => {
  let mockTransport: jest.Mock;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as any).__DEV__ = true;
    mockTransport = jest.fn();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    jest.clearAllMocks();

    logger.reset();
  });

  it('should support all log levels', () => {
    logger.setTransport(mockTransport);
    const log = logger.create('Test');

    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');

    expect(mockTransport).toHaveBeenCalledTimes(4);
  });

  it('should call transport with level, tag, message, context', () => {
    logger.setTransport(mockTransport);
    const log = logger.create('SyncService');

    log.info('Starting sync', { email: 'user@example.com' });

    expect(mockTransport).toHaveBeenCalledWith(
      'info',
      'SyncService',
      'Starting sync',
      { email: 'user@example.com' },
    );
  });

  it('should allow changing transport at runtime', () => {
    const transport1 = jest.fn();
    const transport2 = jest.fn();
    const log = logger.create('Test');

    logger.setTransport(transport1);
    log.info('msg1');

    logger.setTransport(transport2);
    log.info('msg2');

    expect(transport1).toHaveBeenCalledTimes(1);
    expect(transport2).toHaveBeenCalledTimes(1);
  });

  it('should output to console using default transport (info)', () => {
    logger.setTransport(defaultTransport);

    const log = logger.create('Test');
    log.info('message');

    expect(consoleLogSpy).toHaveBeenCalledWith('[Test]', 'message');
  });

  it('should use correct console method for each level', () => {
    logger.setTransport(defaultTransport);

    const log = logger.create('Test');

    log.error('error msg');
    expect(consoleErrorSpy).toHaveBeenCalled();

    log.warn('warn msg');
    expect(consoleWarnSpy).toHaveBeenCalled();

    log.info('info msg');
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
