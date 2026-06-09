import {
  getBadgeStage,
  getWorkflowStage,
  getWorkflowStageLabel,
  isCompleteStatus,
} from './workflowStage';

describe('workflowStage', () => {
  describe('isCompleteStatus', () => {
    it('returns true for complete statuses', () => {
      expect(isCompleteStatus('complete')).toBe(true);
      expect(isCompleteStatus('Complete')).toBe(true);
      expect(isCompleteStatus('completed')).toBe(true);
    });

    it('returns false for active workflow statuses', () => {
      expect(isCompleteStatus('draft')).toBe(false);
      expect(isCompleteStatus('peer_check')).toBe(false);
      expect(isCompleteStatus('not_started')).toBe(false);
      expect(isCompleteStatus(null)).toBe(false);
    });
  });

  describe('getWorkflowStage', () => {
    it('maps all six canonical stages', () => {
      expect(getWorkflowStage('draft')).toBe('draft');
      expect(getWorkflowStage('peer_check')).toBe('peer_check');
      expect(getWorkflowStage('not_started')).toBe('not_started');
      expect(getWorkflowStage('')).toBe('not_started');
      expect(getWorkflowStage('community_check')).toBe('community_check');
      expect(getWorkflowStage('advanced_check')).toBe('advanced_check');
      expect(getWorkflowStage('complete')).toBe('complete');
    });

    it('maps API aliases', () => {
      expect(getWorkflowStage('community_review')).toBe('community_check');
      expect(getWorkflowStage('consultant_check')).toBe('advanced_check');
      expect(getWorkflowStage('completed')).toBe('complete');
    });

    it('returns null for unset status', () => {
      expect(getWorkflowStage(null)).toBeNull();
      expect(getWorkflowStage(undefined)).toBeNull();
    });

    it('returns null for unknown statuses', () => {
      expect(getWorkflowStage('unknown_stage')).toBeNull();
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
      expect(getWorkflowStageLabel('community_check')).toBe('Community Check');
      expect(getWorkflowStageLabel('advanced_check')).toBe('Advanced Check');
      expect(getWorkflowStageLabel('complete')).toBe('Complete');
    });
  });
});
