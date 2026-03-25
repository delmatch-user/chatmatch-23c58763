

# Auto-Popular Dados nas Abas Treinamento, Sugestões e Evolução

## Problema Atual
As três abas mostram "Nenhuma sugestão ainda" até que o admin clique manualmente em "Gerar Sugestões" ou "Executar Análise". O usuário quer que elas já venham com dados reais do departamento Suporte.

## Solução

### 1. Auto-trigger na aba "Treinamento"
**Arquivo:** `src/pages/admin/AdminBrain.tsx`

Quando a aba Treinamento carrega e `trainingSuggestions` está vazio (após o loading), disparar automaticamente `generateTrainingSuggestions()` uma única vez por sessão. Usar um `useRef` (`autoTriggeredTraining`) para evitar chamadas repetidas.

### 2. Auto-trigger na aba "Sugestões da Delma"
**Arquivo:** `src/components/admin/DelmaSuggestionsTab.tsx`

Quando as sugestões carregam e o resultado é vazio (0 pendentes + 0 processadas), automaticamente invocar `triggerAnalysis()` uma vez. Usar um `useRef` para controle.

### 3. Auto-trigger na aba "Evolução"
**Arquivo:** `src/components/admin/DelmaEvolutionTab.tsx`

Se ao carregar os dados, tanto `suggestions` quanto `memories` estiverem vazios, disparar a análise autônoma (`delma-autonomous-analysis`) automaticamente para popular memórias e sugestões iniciais.

### 4. Seed inicial de memórias no Edge Function
**Arquivo:** `supabase/functions/delma-autonomous-analysis/index.ts`

Melhorar a função `storeDataSignals` para gerar mais sinais iniciais:
- Snapshot de robôs ativos (nomes, status, quantidade de Q&As)
- Top tags da última semana
- Média de TMA/TME por atendente
- Contagem de conversas por canal

Isso garante que na primeira execução, o `delma_memory` já receba dados ricos e a aba Evolução mostre memórias ativas.

## Detalhes Técnicos

```text
AdminBrain.tsx
├── useRef autoTriggeredTraining = false
├── useEffect: quando activeTab === 'training' && !loadingTraining && trainingSuggestions.length === 0 && !autoTriggeredTraining.current
│   └── generateTrainingSuggestions() + autoTriggeredTraining.current = true

DelmaSuggestionsTab.tsx
├── useRef autoTriggered = false
├── useEffect: quando !loading && suggestions.length === 0 && !autoTriggered.current
│   └── triggerAnalysis() + autoTriggered.current = true

DelmaEvolutionTab.tsx
├── useRef autoTriggered = false
├── useEffect: quando !loading && suggestions.length === 0 && memories.length === 0 && !autoTriggered.current
│   └── invocar delma-autonomous-analysis + autoTriggered.current = true + reload

delma-autonomous-analysis/index.ts (storeDataSignals)
├── Adicionar: snapshot de robôs ativos do Suporte
├── Adicionar: top 10 tags da semana
├── Adicionar: média TMA/TME por atendente ativo
├── Adicionar: volume por canal (whatsapp/instagram/machine)
```

## Arquivos a Editar
| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/AdminBrain.tsx` | Auto-trigger training na primeira visita |
| `src/components/admin/DelmaSuggestionsTab.tsx` | Auto-trigger análise quando vazio |
| `src/components/admin/DelmaEvolutionTab.tsx` | Auto-trigger quando sem dados |
| `supabase/functions/delma-autonomous-analysis/index.ts` | Enriquecer storeDataSignals com mais sinais do Suporte |

