import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';

const MY_WORK_EMPTY_MESSAGE =
  "You don't have any chapters to work on right now. Check the Projects tab to find available work.";

export function MyWorkTab() {
  return <EmptyState message={MY_WORK_EMPTY_MESSAGE} />;
}
