let settled = false;
let release: () => void = () => {};
let gate = new Promise<void>(r => {
  release = () => {
    settled = true;
    r();
  };
});

export const launchRecoveryGate = {
  whenSettled: () => gate,
  isSettled: () => settled,
  settle: () => release(),
  /** Tests only. */
  reset: () => {
    settled = false;
    gate = new Promise<void>(r => {
      release = () => {
        settled = true;
        r();
      };
    });
  },
};
