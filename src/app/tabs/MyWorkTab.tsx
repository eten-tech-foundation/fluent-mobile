import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { MY_WORK_EMPTY_MESSAGE } from '../../constants/messages';

export function MyWorkTab() {
  return <EmptyState message={MY_WORK_EMPTY_MESSAGE} />;
}
