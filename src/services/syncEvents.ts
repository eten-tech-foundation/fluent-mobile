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
  [...authSessionExpiredListeners].forEach(fn => fn());
}

/** Recording-upload session events (distinct from metadata sync). */
export type UploadSessionEvent =
  | { type: 'start'; totalChapters: number }
  | { type: 'progress'; completedChapters: number; totalChapters: number }
  | { type: 'paused'; reason: 'user' | 'connectivity' }
  | { type: 'cancelled' }
  | { type: 'complete' }
  | { type: 'waiting_wifi' }
  | { type: 'idle' };

type UploadSessionListener = (event: UploadSessionEvent) => void;

const uploadSessionListeners: UploadSessionListener[] = [];

export function onUploadSessionEvent(fn: UploadSessionListener): () => void {
  uploadSessionListeners.push(fn);
  return () => {
    const idx = uploadSessionListeners.indexOf(fn);
    if (idx > -1) uploadSessionListeners.splice(idx, 1);
  };
}

export function emitUploadSessionEvent(event: UploadSessionEvent): void {
  [...uploadSessionListeners].forEach(fn => fn(event));
}
