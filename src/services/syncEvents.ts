type SyncListener = () => void;
type SyncStartListener = (isFull: boolean) => void;

const completeListeners: SyncListener[] = [];
const startListeners: SyncStartListener[] = [];
const authSessionExpiredListeners: SyncListener[] = [];

export function onSyncComplete(fn: SyncListener): () => void {
  completeListeners.push(fn);
  return () => {
    const idx = completeListeners.indexOf(fn);
    if (idx > -1) completeListeners.splice(idx, 1);
  };
}

export function emitSyncComplete(): void {
  completeListeners.forEach(fn => fn());
}

export function onSyncStart(fn: SyncStartListener): () => void {
  startListeners.push(fn);
  return () => {
    const idx = startListeners.indexOf(fn);
    if (idx > -1) startListeners.splice(idx, 1);
  };
}

export function emitSyncStart(isFull = false): void {
  startListeners.forEach(fn => fn(isFull));
}

export function onAuthSessionExpired(fn: SyncListener): () => void {
  authSessionExpiredListeners.push(fn);
  return () => {
    const idx = authSessionExpiredListeners.indexOf(fn);
    if (idx > -1) authSessionExpiredListeners.splice(idx, 1);
  };
}

export function emitAuthSessionExpired(): void {
  authSessionExpiredListeners.forEach(fn => fn());
}
