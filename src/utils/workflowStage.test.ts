import {
  getBadgeStage,
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

  describe('getBadgeStage', () => {
    it('maps draft, peer_check, and not_started', () => {
      expect(getBadgeStage('draft')).toBe('draft');
      expect(getBadgeStage('DRAFT')).toBe('draft');
      expect(getBadgeStage('peer_check')).toBe('peer_check');
      expect(getBadgeStage('not_started')).toBe('not_started');
      expect(getBadgeStage('')).toBe('not_started');
    });

    it('returns null for statuses without a my-work badge', () => {
      expect(getBadgeStage('community_review')).toBeNull();
      expect(getBadgeStage(undefined)).toBeNull();
    });
  });

  describe('getWorkflowStageLabel', () => {
    it('returns display labels', () => {
      expect(getWorkflowStageLabel('draft')).toBe('Draft');
      expect(getWorkflowStageLabel('peer_check')).toBe('Peer Check');
      expect(getWorkflowStageLabel('not_started')).toBe('Not Started');
    });
  });
});
