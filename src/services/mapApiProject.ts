import { ApiProject } from '../types/api/responses';
import { Project } from '../types/db/types';

export function mapApiProject(api: ApiProject): Project {
  const sourceLanguageId = api.sourceLanguageId ?? api.source_language_id;
  const targetLanguageId = api.targetLanguageId ?? api.target_language_id;

  return {
    id: api.id,
    name: api.name,
    sourceLanguageId,
    source_language_id: sourceLanguageId,
    source_language_name: api.source_language_name,
    targetLanguageId,
    target_language_id: targetLanguageId,
    target_language_name: api.target_language_name ?? '',
    isActive: api.isActive,
    status: api.status,
    updatedAt: api.updatedAt,
  };
}
