export class Storage {
  constructor(_: unknown) {}

  getItemSync = jest.fn();
  setItemSync = jest.fn();
  removeItemSync = jest.fn();
}
