# Issue #51 — Guia de verificação antes da PR

**Ticket:** https://github.com/eten-tech-foundation/fluent-mobile/issues/51  
**Plano:** [`issue-51-prepare-offline-resource-download.md`](./issue-51-prepare-offline-resource-download.md)  
**Branch:** `jonathanseehagen/feature/51-prepare-offline-resource-download`  
**Escopo desta PR:** UI de recursos + camada de dados simulada (fetch) + mocks de QA + stub de enqueue. **Não** inclui FluentAPI real (#201) nem controles de download (#52).

Use este guia na **ordem das seções** — cada camada depende da anterior.

---

## 1. Mapa mental (30 segundos)

```
Capítulos selecionados (#50)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│  prepareOfflineResources.ts  (service — simula fetch/API)     │
│  fetchPrepareOfflineManifest() · getResourceStatus() · sub   │
└──────────────────────────┬───────────────────────────────────┘
                           │ __DEV__ only ↓
           ┌───────────────┴────────────────┐
           ▼                                ▼
    offlineDownloadCatalog.ts              offlineDownloadInventoryRuntime.ts
    (o que PODE baixar)              (o que JÁ ESTÁ no device)
           │                                ▲
           └ offlineDownloadInventoryScenarios.ts ─┘
                           │
                           ▼
         usePrepareOfflineResourceData  (hook — async fetch)
                           │
                           ▼
         prepareOfflineCatalog.ts  (PURO — zero import de mock)
                           │
                           ▼
         usePrepareOfflineResources → PrepareOfflineResourcesSection
                           │
         Tap Download ─────┴──► prepareOfflineDownload.ts → service (sim)
                           └──► storage.setPrepareOfflineDownloadStarted (#39)
```

**Regra de ouro:** código de produção (UI, catalog, hooks de negócio) **não** importa `src/mocks/prepareOffline/`. Só `prepareOfflineResources.ts` importa mocks — e só em `__DEV__`.

**Substituições futuras (#201 / #52):**

| Hoje (#51) | #201 | #52 |
|------------|------|-----|
| `prepareOfflineResources.ts` internals | FluentAPI + SQLite inventory + worker events | — |
| `offlineDownloadCatalog.ts` / `offlineDownloadInventoryRuntime.ts` | Removidos do path de produção | — |
| `enqueuePrepareOfflineDownload` stub | queue + worker real | — |
| Ícones estáticos em `ResourceItemRow` | worker atualiza `status` | anéis de progresso |
| Placeholder pós-Download | — | Pause / Resume / Cancel |

---

## 2. Ordem de conferência dos arquivos

### Camada A — Tipos (contrato estável)

| # | Arquivo | O que faz | O que conferir | Follow-up |
|---|---------|-----------|----------------|-----------|
| A1 | `src/types/prepareOffline/types.ts` | Tipos: item, catálogo, manifest, inventário | `PrepareOfflineResourceManifestEntry` (`resourceKey`, `tier`, `scope`, `unitBytes`). `BuildPrepareOfflineCatalogInput` exige `manifest` + `getResourceStatus` — não `projectId` | #201: `downloadUrl` no item ou tipo separado |

**Verificação:** UI usa só tipos deste arquivo — sem shapes ad hoc.

---

### Camada B — Lógica pura (sem mock, sem UI)

| # | Arquivo | O que faz | O que conferir | Follow-up |
|---|---------|-----------|----------------|-----------|
| B1 | `src/utils/formatByteSize.ts` | `"8 MB"`, `"164 MB"` | Labels do Total e do botão | — |
| B2 | `src/utils/prepareOfflineResourceId.ts` | `manifestEntryToResourceId`, `kindLabel` | Helpers compartilhados (catalog + mocks); não são mock-specific | #201: IDs do servidor |
| B3 | `src/utils/prepareOfflineCatalog.ts` | Catálogo, totais, lock/deselect | **Sem** `import … mocks/prepareOffline`. Recebe `manifest` + `getResourceStatus` | — |
| B4 | `src/utils/prepareOfflineCatalog.test.ts` | Testes da matemática | Usa `MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST` + `getPrepareOfflineResourceStatus` via helper `buildTestCatalog` | — |

**Verificação B3:**

```bash
rg "mocks/prepareOffline" src/utils/prepareOfflineCatalog.ts
# → nenhum resultado
```

---

### Camada C — Service layer (único ponto de plug-in #201)

| # | Arquivo | O que faz | O que conferir | Follow-up |
|---|---------|-----------|----------------|-----------|
| C1 | `src/services/prepareOfflineResources.ts` | Data access: fetch manifest, status, subscription, sim progress | Header documenta API. Em prod: manifest vazio + status `selected` até #201 | Implementar FluentAPI + repo aqui |
| C2 | `src/services/prepareOfflineDownload.ts` | Enqueue stub | Chama `simulatePrepareOfflineDownloadProgress` via service — **não** importa mocks | #201: queue + worker |

**API do service (conferir exports):**

| Função | Dev | Prod (até #201) |
|--------|-----|-----------------|
| `fetchPrepareOfflineManifest(projectId)` | Mock manifest async | `[]` + log warn |
| `getPrepareOfflineResourceStatus(projectId, id)` | Mock inventory | `'selected'` |
| `subscribePrepareOfflineInventory(listener)` | Mock pub/sub | no-op |
| `clearPrepareOfflineSessionInventory()` | Limpa overrides | no-op |
| `getDefaultPrepareOfflinePackageDeselects()` | Cenário ativo | `new Set()` |
| `simulatePrepareOfflineDownloadProgress(...)` | Sim ~2.5s/item | no-op |

**Verificação — único import de mock em produção:**

```bash
rg "mocks/prepareOffline" src --glob "*.ts" --glob "*.tsx" \
  | rg -v "\.test\.(ts|tsx)" \
  | rg -v "mocks/prepareOffline/"
# → só src/services/prepareOfflineResources.ts
```

---

### Camada D — Mocks (QA dev; isolados atrás do service)

| # | Arquivo | O que faz | Relacionamento | Follow-up |
|---|---------|-----------|----------------|-----------|
| D1 | `src/mocks/prepareOffline/offlineDownloadCatalog.ts` | Catálogo estático (11 recursos, 3 tiers) | **Com** `offlineDownloadInventoryScenarios.ts` (ids) e **com** `offlineDownloadInventoryRuntime.ts` (status por id). Consumido via service fetch | FluentAPI response |
| D2 | `src/mocks/prepareOffline/offlineDownloadInventoryScenarios.ts` | 6 cenários + regra cumulativa | Usa ids de `offlineDownloadCatalog.ts`; alimenta `offlineDownloadInventoryRuntime.ts` via `buildMockInventoryForScenario` | Dev-only |
| D3 | `src/mocks/prepareOffline/offlineDownloadInventoryRuntime.ts` | Runtime in-memory + pub/sub + sim download | Lê ids de `offlineDownloadCatalog.ts`; base de `offlineDownloadInventoryScenarios.ts`; expõe status ao service | SQLite + worker (#201) |
| D4 | `src/mocks/prepareOffline/index.ts` | Barrel export + tabela de papéis | Re-exporta offlineDownloadCatalog, offlineDownloadInventoryScenarios, offlineDownloadInventoryRuntime | — |
| D5 | `src/mocks/prepareOffline/offlineDownloadInventoryScenarios.test.ts` | Cenários + normalização | — | — |
| D6 | `src/mocks/prepareOffline/offlineDownloadInventoryRuntime.test.ts` | Runtime + simulação | Default `fresh` | — |

**Relação manifest ↔ inventory (resumo):**

- **offlineDownloadCatalog** = lista do que existe (nome, tier, bytes, escopo)
- **offlineDownloadInventoryRuntime** = para cada id do manifest, qual o status (`completed` / `downloading` / `selected`)
- **offlineDownloadInventoryScenarios** = presets de inventory para QA (`fresh`, `mixed`, etc.)

**QA no dispositivo:**

1. `offlineDownloadInventoryScenarios.ts` → `DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO = 'fresh'` (default)
2. Para testar mid-download: trocar para `'mixed'`, reload Metro
3. Prepare for Offline → projeto → capítulo

| Cenário | Esperado |
|---------|----------|
| `fresh` | Download ~318 MB |
| `tier1` | All on device; Tier 2/3 desmarcados no Customize |
| `mixed` | Tier 1 ✓; Words audio downloading; Download ~164 MB |
| `all` | All on device; botão desabilitado |

---

### Camada E — Hooks

| # | Arquivo | O que faz | O que conferir | Follow-up |
|---|---------|-----------|----------------|-----------|
| E1 | `src/hooks/usePrepareOfflineSelection.ts` | Capítulos + seleção (#50) | Exporta `chapters` para recursos | — |
| E2 | `src/hooks/usePrepareOfflineResourceData.ts` | **Fetch hook** — manifest async + subscription | Chama service; **sem** import de mock | #201: loading/error UX se API falhar |
| E3 | `src/hooks/usePrepareOfflineResources.ts` | Catálogo, deselects, totais, CTA, download | Usa E2; passa `manifest` + `getResourceStatus` ao catalog | `downloadStarted` persistente (#52) |
| E4 | `src/hooks/usePrepareOfflineResources.test.ts` | Testes com `waitFor` (fetch async) | CTA, deselect, sessão, enqueue | — |

**Regras de negócio (E3):**

| Regra | Onde |
|-------|------|
| Tier 1 nunca desmarca | `isTierLocked` |
| `completed` locked no customize | `isItemCustomizeLocked` |
| Total = effective (inclui completed) | `computeTotalBytes` |
| Botão = só pending | `computePendingBytes` + `canDownload` |
| Unassigned: ≥1 capítulo | `canDownload` |
| Reset deselects | `projectId:userId` → service clear + default package |

---

### Camada F — UI

| # | Arquivo | O que conferir | Follow-up |
|---|---------|----------------|-----------|
| F1 | `PrepareForOfflineScreen.tsx` | Sem debug logging; wire accordion + section | — |
| F2 | `PrepareOfflineResourcesSection.tsx` | Ordem UI; placeholder #52 pós-download | #52 controls |
| F3 | `PrepareOfflineResourceSummary.tsx` | Read-only; `summaryCatalog` | — |
| F4 | `CustomizeDownloadAccordion.tsx` | Collapsed default; 3 tiers | — |
| F5 | `ResourceTierSection.tsx` | Headers TIER 1/2/3 | — |
| F6 | `ResourceItemRow.tsx` | Ícones summary + lock/checkbox customize | #52 progress ring |
| F7 | `SelectionCheckbox.tsx` | Visual checkbox | — |
| F8–F10 | `*.test.tsx` | Section, row, screen integration | — |

**Verificação F — UI sem mocks:**

```bash
rg "mocks/prepareOffline" src/app --glob "*.tsx"
# → nenhum resultado (só testes podem importar)
```

---

## 3. Checklist rápido antes da PR

### Código

- [ ] Arquivos das camadas A–F existem e compilam
- [ ] `DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO = 'fresh'`
- [ ] Sem debug logging em `PrepareForOfflineScreen.tsx`
- [ ] Só `prepareOfflineResources.ts` importa mocks (comando rg acima)
- [ ] `prepareOfflineCatalog.ts` é puro (sem mock)
- [ ] `prepareOfflineMock.ts` **removido** (gate no service)

### CI local

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --ci
```

### AC #51

- [ ] Summary agrupado por recurso (Text/Audio + MB)
- [ ] Tier 1 locked; Customize Tier 2/3; collapsed default
- [ ] Deselects resetam em `projectId:userId`
- [ ] Total + botão atualizam com deselect
- [ ] Unassigned: off sem capítulo; assigned: on com pending
- [ ] Download → `setPrepareOfflineDownloadStarted` + enqueue

### Waivers (Follow-ups PR)

- [ ] **#52** — Pause/Resume/Cancel + progress rings
- [ ] **#201** — Implementar `prepareOfflineResources.ts` + worker + queue
- [ ] **fluent-api** — contrato manifest + URLs

### QA Android (recomendado)

- [ ] Cenário `fresh` — Download ~318 MB
- [ ] Customize expand — lock Tier 1
- [ ] Desmarcar Tier 3 — total/botão diminuem
- [ ] Download tap — placeholder #52; dev sim ~2.5s/item

---

## 4. Integração futura (#201 + #52)

### Não precisa mudar

- Toda UI (`PrepareOfflineResourcesSection`, rows, accordion)
- `prepareOfflineCatalog.ts` (já puro)
- `usePrepareOfflineResources.ts` (orquestração)
- `types/prepareOffline/types.ts`
- `formatByteSize.ts`, `prepareOfflineResourceId.ts`

### #201 — mudar só o service (+ enqueue body)

| Passo | Onde | Mudança |
|-------|------|---------|
| 1 | `prepareOfflineResources.ts` | `fetchPrepareOfflineManifest` → FluentAPI |
| 2 | `prepareOfflineResources.ts` | `getPrepareOfflineResourceStatus` → SQLite/repo |
| 3 | `prepareOfflineResources.ts` | `subscribePrepareOfflineInventory` → queue events |
| 4 | `prepareOfflineDownload.ts` | Persist queue, URLs, start worker |
| 5 | Remover | Imports de mocks no service quando API estável |

**Não refatorar:** catalog builder — já recebe manifest + status injectados.

### #52 — controles + progress UI

| Passo | Onde |
|-------|------|
| 1 | Substituir placeholder em `PrepareOfflineResourcesSection` |
| 2 | Hook de sessão compartilhado com fila (#201) |
| 3 | `ResourceItemRow` — progress ring quando `downloading` |
| 4 | `downloadStarted` derivado de KV/fila no mount |

### Contrato enqueue (estável)

```typescript
enqueuePrepareOfflineDownload({
  userId: number,
  projectId: number,
  items: PrepareOfflineResourceItem[],
})
```

---

## 5. Texto sugerido para a PR

### TLDR

Implementa **Resources to download** (#51): summary, Customize (Tier 2/3 opt-out), total dinâmico, Download CTA, stub enqueue + flag #39. Dados via **`prepareOfflineResources` service** (fetch simulado em dev; mocks isolados). #201 implementa API/worker no service; #52 adiciona controles pós-download.

### Technical changes

**Tipos e lógica pura**

- `src/types/prepareOffline/types.ts`
- `src/utils/prepareOfflineCatalog.ts` + test — pure builder (`manifest` + `getResourceStatus`)
- `src/utils/prepareOfflineResourceId.ts`
- `src/utils/formatByteSize.ts`

**Data layer (mock behind service until #201)**

- `src/services/prepareOfflineResources.ts` — fetch, status, subscription, sim progress
- `src/hooks/usePrepareOfflineResourceData.ts` — async fetch hook
- `src/mocks/prepareOffline/` — offlineDownloadCatalog, offlineDownloadInventoryScenarios, offlineDownloadInventoryRuntime, tests

**Download + orchestration**

- `src/services/prepareOfflineDownload.ts` — enqueue stub
- `src/hooks/usePrepareOfflineResources.ts` + test
- `src/hooks/usePrepareOfflineSelection.ts` — export `chapters`

**UI**

- `src/app/prepare-offline/*` (section, summary, customize, rows)
- `src/app/screens/PrepareForOfflineScreen.tsx` + test

### Follow-ups

- #201 — FluentAPI + inventory repo inside `prepareOfflineResources.ts`; queue/worker in `prepareOfflineDownload.ts`
- #52 — Pause/Resume/Cancel; progress rings
- fluent-api — manifest contract (`resourceKey`, `scope`, `unitBytes`, download URLs)

### How to verify

1. Home/Settings → Prepare for Offline → projeto → capítulo(s)
2. RESOURCES TO DOWNLOAD, Total, botão Download visíveis
3. Customize → Tier 1 locked; desmarcar Tier 3 → total/botão atualizam
4. (Opcional) `offlineDownloadInventoryScenarios.ts`: `mixed` + reload → ~164 MB pending
5. Download → placeholder #52; dev: status avança ~2.5s/item

**Expected:** AC #51 UI; mocks substituíveis trocando só o service (#201).

---

## 6. Arquivos desta PR vs fora do escopo

### Incluídos

Tudo nas camadas A–F + `docs/plans/issue-51-*.md`.

### Fora do escopo

| Path | Motivo |
|------|--------|
| `ChapterSelectionAccordion.tsx`, etc. | #50 |
| `queries.prepareOffline.ts` | #50 |
| `prepareOfflineTrigger.ts` | #39 |
| `.scratch/*` | Não commitar |
| ~~`config/prepareOfflineMock.ts`~~ | Removido — substituído pelo service |

---

*Atualizado 2026-08-03 — service layer + fetch hook.*
