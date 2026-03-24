

## Plano: Renomear "Operacional - Normal" para "Operacional - Geral"

A tag canonica passa a ser **"Operacional - Geral"**. Tanto `OPERACIONAL_PENDENTE` quanto `Operacional - Normal` e `Operacional - Pendente` serao normalizados para esse novo nome.

### Mudancas

| Arquivo | O que muda |
|---------|-----------|
| `src/lib/tagColors.ts` | Trocar `Operacional - Normal` por `Operacional - Geral` em `SUPORTE_TAXONOMY_TAGS`, `TAG_COLOR_MAP`, `TAG_DOT_COLOR_MAP`. Adicionar `Operacional - Normal` e `Operacional - Pendente` ao `TAG_NORMALIZATION` apontando para `Operacional - Geral`. |
| `src/pages/admin/AdminBrain.tsx` | Trocar `Operacional - Normal` por `Operacional - Geral` no `barColors`. |
| `supabase/functions/classify-conversation-tags/index.ts` | Trocar `Operacional - Normal` por `Operacional - Geral` em `TAXONOMY_TAGS`, `TAG_TO_PRIORITY` e no prompt do LLM. |
| `supabase/functions/brain-analysis/index.ts` | Trocar `Operacional - Normal` por `Operacional - Geral` no array `taxonomyTags`. |

### Normalizacao

```typescript
const TAG_NORMALIZATION = {
  'OPERACIONAL_PENDENTE': 'Operacional - Geral',
  'Operacional - Normal': 'Operacional - Geral',
  'Operacional - Pendente': 'Operacional - Geral',
  // ... demais mapeamentos existentes
};
```

Isso garante que qualquer formato antigo no banco seja exibido como "Operacional - Geral" sem duplicatas.

