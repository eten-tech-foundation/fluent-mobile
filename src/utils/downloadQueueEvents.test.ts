import {
  emitDownloadQueueChanged,
  onDownloadQueueChanged,
} from './downloadQueueEvents';

describe('downloadQueueEvents', () => {
  it('notifies subscribers and supports unsubscribe', () => {
    const first = jest.fn();
    const second = jest.fn();
    const unsubscribeFirst = onDownloadQueueChanged(first);
    const unsubscribeSecond = onDownloadQueueChanged(second);

    emitDownloadQueueChanged();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    emitDownloadQueueChanged();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    emitDownloadQueueChanged();
    expect(second).toHaveBeenCalledTimes(2);
  });
});
