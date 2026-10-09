import { ApiMilestone } from '../types/api/responses';

export function mapApiMilestone(api: ApiMilestone): {
  id: number;
  projectId: number;
  name: string;
} {
  return {
    id: api.id,
    projectId: api.projectId,
    name: api.name,
  };
}
