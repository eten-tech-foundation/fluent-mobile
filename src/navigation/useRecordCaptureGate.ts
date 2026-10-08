import { useEffect, useState } from 'react';
import {
  getRecordCaptureGate,
  subscribeRecordCaptureGate,
} from './recordCaptureGate';

/** Subscribe to the drafting record-capture gate (#568). */
export function useRecordCaptureGate(): boolean {
  const [active, setActive] = useState(getRecordCaptureGate);

  useEffect(() => subscribeRecordCaptureGate(setActive), []);

  return active;
}
