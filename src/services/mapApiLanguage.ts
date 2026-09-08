import type { ApiLanguage } from '../types/api/responses';
import type { Language } from '../types/db/types';

/** Map Fluent API language shape → local DB language row. */
export function mapApiLanguage(api: ApiLanguage): Language {
  return {
    id: api.id,
    langName: api.langName,
    langNameLocalized: api.langNameLocalized ?? undefined,
    // API OpenAPI field is `langCodeIso6393`; older clients used `langCode`.
    langCode: api.langCodeIso6393 ?? api.langCode ?? undefined,
    scriptDirection: api.scriptDirection ?? undefined,
  };
}
