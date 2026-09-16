import {
  getBadgeStage,
  getWorkflowStage,
  getWorkflowStageLabel,
  isCompleteStatus,
} from './workflowStage';

describe('workflowStage', () => {
  describe('isCompleteStatus', () => {
    it('returns true for complete status', () => {
      expect(isCompleteStatus('complete')).toBe(true);
      expect(isCompleteStatus('Complete')).toBe(true);
    });

    it('returns false for active workflow statuses', () => {
      expect(isCompleteStatus('draft')).toBe(false);
      expect(isCompleteStatus('peer_check')).toBe(false);
      expect(isCompleteStatus('not_started')).toBe(false);
      expect(isCompleteStatus('completed')).toBe(false);
      expect(isCompleteStatus(null)).toBe(false);
    });
  });

  describe('getWorkflowStage', () => {
    it('maps all six canonical stages', () => {
      expect(getWorkflowStage('draft')).toBe('draft');
      expect(getWorkflowStage('peer_check')).toBe('peer_check');
      expect(getWorkflowStage('not_started')).toBe('not_started');
      expect(getWorkflowStage('')).toBe('not_started');
      expect(getWorkflowStage('community_review')).toBe('community_review');
      expect(getWorkflowStage('complete')).toBe('complete');
    });

    it('maps advanced-check sub-statuses to the advanced_check bucket', () => {
      expect(getWorkflowStage('linguist_check')).toBe('advanced_check');
      expect(getWorkflowStage('theological_check')).toBe('advanced_check');
      expect(getWorkflowStage('consultant_check')).toBe('advanced_check');
    });

    it('returns null for unset status', () => {
      expect(getWorkflowStage(null)).toBeNull();
      expect(getWorkflowStage(undefined)).toBeNull();
    });

    it('returns null for unknown statuses', () => {
      expect(getWorkflowStage('unknown_stage')).toBeNull();
      expect(getWorkflowStage('completed')).toBeNull();
    });
  });

  describe('getBadgeStage', () => {
    it('maps draft, peer_check, and not_started', () => {
      expect(getBadgeStage('draft')).toBe('draft');
      expect(getBadgeStage('DRAFT')).toBe('draft');
      expect(getBadgeStage('peer_check')).toBe('peer_check');
      expect(getBadgeStage('not_started')).toBe('not_started');
      expect(getBadgeStage('')).toBe('not_started');
    });

    it('returns null for statuses outside my work', () => {
      expect(getBadgeStage('community_review')).toBeNull();
      expect(getBadgeStage('complete')).toBeNull();
      expect(getBadgeStage(undefined)).toBeNull();
    });
  });

  describe('getWorkflowStageLabel', () => {
    it('returns display labels for all stages', () => {
      expect(getWorkflowStageLabel('draft')).toBe('Draft');
      expect(getWorkflowStageLabel('peer_check')).toBe('Peer Check');
      expect(getWorkflowStageLabel('not_started')).toBe('Not Started');
      expect(getWorkflowStageLabel('community_review')).toBe('Community Check');
      expect(getWorkflowStageLabel('advanced_check')).toBe('Advanced Check');
      expect(getWorkflowStageLabel('complete')).toBe('Complete');
    });
  });
});
