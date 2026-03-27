

# Tornar o Score de Maturidade reflexo real do conhecimento da Delma

## Problema atual

A formula atual (linha 2796) calcula:

```text
Score = (% IA resolve * 0.40) + (melhoria TMA * 0.30) + (100 - erros% * 0.30)
```

Isso ignora completamente o conhecimento acumulado da Delma: sugestoes aprovadas, Q&As dos robos, memorias ativas, temas dominados. O score fica travado em ~25 porque depende apenas de metricas de volume do periodo selecionado, sem considerar evolucao cumulativa.

## Nova formula proposta

```text
Score = (Automacao * 0.25) + (Conhecimento * 0.25) + (Aprendizado * 0.25) + (Eficiencia * 0.25)
```

Cada componente (0-100):

| Componente | O que mede | Como calcula |
|---|---|---|
| Automacao | % conversas resolvidas por IA | aiPct (ja existe) |
| Conhecimento | Cobertura de Q&A + temas dominados | (qaPairs total / max esperado) + (temas dominados / total temas) |
| Aprendizado | Sugestoes aprovadas + memorias ativas | count de delma_suggestions approved + delma_memory ativas |
| Eficiencia | Melhoria de TMA + reducao de erros | tmaBonusPct + (100 - errorPct) combinados |

O score so pode crescer ou manter — nunca cai abaixo do maximo historico (efeito ratchet), refletindo que conhecimento adquirido nao se perde.

## Mudanca

| # | Arquivo | O que muda |
|---|---------|-----------|
| 1 | `src/pages/admin/AdminBrain.tsx` | Nova funcao `computeKnowledgeData` que busca dados cumulativos (delma_suggestions aprovadas, delma_memory ativas, qa_pairs dos robos) e aplica a nova formula com piso historico |

### Detalhes tecnicos (AdminBrain.tsx)

**Antes de `computeKnowledgeData`** — adicionar fetch de dados cumulativos no `fetchMetrics` ou em useEffect separado:
- `delma_suggestions` com `status = 'approved'` ou `'edited'` — count total
- `delma_memory` com `expires_at > now()` — count total
- `robots` (Julia + Sebastiao) — somar total de `qa_pairs`

**Na funcao `computeKnowledgeData`** — receber esses counts como parametros extras:
- `knowledgeScore = min(100, (totalQAs / 50) * 50 + (masteredCount / max(topTags.length, 1)) * 50)`
- `learningScore = min(100, (approvedSuggestions * 5) + (activeMemories * 2))`
- `efficiencyScore = (tmaBonusPct * 0.5) + (max(0, 100 - errorPct * 5) * 0.5)`
- `automationScore = aiPct`
- `maturityScore = round((automationScore * 0.25) + (knowledgeScore * 0.25) + (learningScore * 0.25) + (efficiencyScore * 0.25))`

**Piso historico (ratchet)**: comparar com o maior valor em `maturityHistory` e usar `max(calculado, historicoMax * 0.95)` — permite queda maxima de 5% para refletir que conhecimento nao se perde mas pode ficar desatualizado.

