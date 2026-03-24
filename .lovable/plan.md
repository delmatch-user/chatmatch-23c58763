

## Plano: Adicionar "Operacional - Normal" como tag canonica e corrigir mapeamento

### Problema
A tag legada `OPERACIONAL_PENDENTE` esta mapeada incorretamente para `Duvida - Geral`. O usuario quer que ela seja convertida para **"Operacional - Normal"** em todo o sistema, como uma 5a tag de taxonomia.

### Mudancas

| Arquivo | O que muda |
|---------|-----------|
| `src/lib/tagColors.ts` | Adicionar `Operacional - Normal` ao `SUPORTE_TAXONOMY_TAGS`. Corrigir mapeamento: `OPERACIONAL_PENDENTE` → `Operacional - Normal`. Adicionar cor laranja no `TAG_COLOR_MAP` e `TAG_DOT_COLOR_MAP`. |
| `src/pages/admin/AdminBrain.tsx` | Adicionar `Operacional - Normal` ao `barColors` do grafico. |
| `supabase/functions/classify-conversation-tags/index.ts` | Adicionar `Operacional - Normal` ao `TAXONOMY_TAGS` e `TAG_TO_PRIORITY`. Atualizar prompt do LLM com a 5a categoria. |
| `supabase/functions/brain-analysis/index.ts` | Adicionar `Operacional - Normal` ao array `taxonomyTags`. |

### Detalhes

**tagColors.ts:**
- `SUPORTE_TAXONOMY_TAGS` passa de 4 para 5 itens
- `'OPERACIONAL_PENDENTE': 'Operacional - Normal'` (correcao)
- Cor: `bg-orange-500/20 text-orange-400 border-orange-500/30`

**classify-conversation-tags (edge function):**
- Nova categoria no prompt: `"Operacional - Normal" — Problemas operacionais, entregas atrasadas, pedidos incorretos, bugs no app`
- Prioridade: `normal`

**brain-analysis (edge function):**
- Adicionar ao array para que apareca nos graficos sem duplicar com o formato legado

Resultado: `OPERACIONAL_PENDENTE` e variantes com emoji serao normalizados para `Operacional - Normal` no frontend, e novas classificacoes usarao esse nome diretamente.

