

# Corrigir Fluxo de Aprendizado da Delma — Busca, Geração e Transparência

## Problema raiz identificado

Analisando as 3 Edge Functions de aprendizado, identifiquei as causas exatas:

1. **`brain-learn-from-conversations`** (linha 55-62): busca `conversation_logs` sem filtro de departamento — puxa tudo, mas não filtra por Suporte. Também exige `finalized_by NOT NULL` (linha 59), o que exclui conversas finalizadas automaticamente por robôs.

2. **`brain-learn-instruction-patterns`** (linha 72-86): filtra apenas conversas com TMA abaixo da média (`qualityLogs`), descartando ~50% dos dados. Se o lote restante for pequeno, retorna 0.

3. **`brain-train-robots`** (linha 103-114): busca sem filtro de departamento e depois filtra por nome do atendente — funciona, mas se nenhum nome bater, retorna 0 silenciosamente.

4. **Nenhuma função tem fallback** — se a IA retorna 0 sugestões ou o JSON falha, o fluxo termina em silêncio.

5. **Nenhuma função tem diagnóstico** — o retorno é apenas "0 sugestões geradas" sem explicar por quê.

## Correções (4 Edge Functions + 1 componente UI)

### 1. `brain-learn-from-conversations/index.ts`

- Adicionar filtro `department_name = 'Suporte'` nas queries de humanLogs e robotLogs
- Excluir conversas do departamento Comercial/SDR
- Remover exigência de `finalized_by NOT NULL` para incluir conversas de robôs
- Adicionar bloco de diagnóstico no início que loga contagens e retorna objeto `diagnostics` na resposta
- Relaxar filtro de `conversation_count > 0` para permitir sugestões baseadas em padrões observados
- Adicionar cadeia de resiliência: se 200 conversas geram 0 sugestões, tentar com 50, depois 10, depois 3
- Se tudo falhar, gerar 1 sugestão automática de diagnóstico (tipo `melhoria_delma`)
- Retornar `diagnostics` no JSON de resposta para a UI exibir

### 2. `brain-learn-instruction-patterns/index.ts`

- Remover filtro de TMA abaixo da média — analisar todas as conversas do Suporte
- Reduzir mínimo de conversas por escopo de 3 para 2
- Adicionar diagnóstico com contagens
- Adicionar fallback: se 0 sugestões, forçar análise com prompt simplificado
- Retornar `diagnostics` na resposta

### 3. `brain-train-robots/index.ts`

- Adicionar filtro `department_name = 'Suporte'` ou filtro de membro do Suporte na query de `conversation_logs`
- Incluir conversas classificadas como `geral` (não apenas motoboy/estabelecimento) — atribuir ao robô com mais afinidade
- Adicionar diagnóstico
- Adicionar fallback para 0 sugestões

### 4. `delma-autonomous-analysis/index.ts`

- No módulo de `storeDataSignals`, adicionar registro de `tema_analisado` no `delma_memory` quando sugestões são geradas
- Não alterar módulos 1-3 existentes (agent_goals, report_patterns, enrichment) — são aditivos

### 5. `DelmaSuggestionsTab.tsx` — UI de transparência

- Substituir toast simples por painel de log expansível mostrando diagnóstico retornado pelas funções
- Adicionar indicador de saúde do fluxo no header (verde/amarelo/vermelho)
- Exibir contagens: conversas encontradas, processadas, excluídas, sugestões geradas
- Mostrar diagnóstico detalhado quando 0 sugestões são geradas (em vez de silêncio)
- Armazenar último resultado de execução em estado local para exibição persistente

## Regras de isolamento respeitadas

- Nenhuma função existente é removida ou renomeada
- Queries adicionam filtros de Suporte (aditivo) — não removem filtros existentes
- SDR/Comercial são explicitamente excluídos em todas as queries
- `sdr-robot-chat` e `sdr-remarketing` não são tocados
- Tabela `delma_memory` recebe novo `type = 'tema_analisado'` sem alterar schema

## Arquivos editados

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/brain-learn-from-conversations/index.ts` | Filtro Suporte, remover filtros restritivos, diagnóstico, cadeia de resiliência, fallback garantido |
| 2 | `supabase/functions/brain-learn-instruction-patterns/index.ts` | Remover filtro TMA, reduzir mínimo, diagnóstico, fallback |
| 3 | `supabase/functions/brain-train-robots/index.ts` | Filtro departamento Suporte, diagnóstico, fallback |
| 4 | `supabase/functions/delma-autonomous-analysis/index.ts` | Registrar temas analisados no delma_memory |
| 5 | `src/components/admin/DelmaSuggestionsTab.tsx` | Painel de log expansível, indicador de saúde, diagnóstico visível |

