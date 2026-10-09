import { launchRecoveryGate } from './launchRecoveryGate';

beforeEach(() => launchRecoveryGate.reset());

describe('launchRecoveryGate', () => {
  it('stays pending until settle() is called', async () => {
    let resolved = false;
    void launchRecoveryGate.whenSettled().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(launchRecoveryGate.isSettled()).toBe(false);

    launchRecoveryGate.settle();
    await launchRecoveryGate.whenSettled();

    expect(resolved).toBe(true);
    expect(launchRecoveryGate.isSettled()).toBe(true);
  });

  it('settle() is idempotent', async () => {
    launchRecoveryGate.settle();
    launchRecoveryGate.settle();
    await launchRecoveryGate.whenSettled();
    expect(launchRecoveryGate.isSettled()).toBe(true);
  });

  it('reset() returns the gate to pending', async () => {
    launchRecoveryGate.settle();
    launchRecoveryGate.reset();
    expect(launchRecoveryGate.isSettled()).toBe(false);

    let resolved = false;
    void launchRecoveryGate.whenSettled().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
  });
});
