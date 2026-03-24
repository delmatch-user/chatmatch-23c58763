

## Plano: Normalizar tags no backend (brain-analysis) para eliminar duplicatas

### Problema
A função `brain-analysis` conta tags brutas do banco sem normalizar. O frontend tem `normalizeTopTags` mas o regex de limpeza de emojis pode não capturar todos os caracteres Unicode usados no banco (ex: `◇`, `◈`, variantes de `◆`). Resultado: `OPERACIONAL_PENDENTE` aparece separado de `Operacional - Geral`.

### Solução
Corrigir em dois pontos:

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Adicionar função `normalizeTag()` no backend e aplicá-la ao contar tags (linha 74), nas tags dos agentes, e nos errorLogs. |
| `src/lib/tagColors.ts` | Melhorar o regex de limpeza para capturar qualquer caractere não-alfanumérico/espaço no início da tag, garantindo robustez. |

### Detalhes

**brain-analysis/index.ts — adicionar normalização server-side:**
```typescript
// Função de normalização (mesmo mapa do frontend)
const TAG_NORMALIZATION: Record<string, string> = {
  'ACIDENTE_URGENTE': 'Acidente - Urgente',
  'FINANCEIRO_NORMAL': 'Financeiro - Normal',
  'DUVIDA_GERAL': 'Duvida - Geral',
  'COMERCIAL_B2B': 'Comercial - B2B',
  'OPERACIONAL_PENDENTE': 'Operacional - Geral',
  'Operacional - Normal': 'Operacional - Geral',
  'Operacional - Pendente': 'Operacional - Geral',
};

function normalizeTag(tag: string): string {
  const clean = tag.replace(/^[^\w\sÀ-ú-]+\s*/u, '').trim();
  return TAG_NORMALIZATION[clean] || clean;
}
```

Aplicar em: contagem de `tagCounts` (linha 74), `agentStats.tags`, e no `mapErrorLog`.

**tagColors.ts — regex mais robusto:**
```typescript
// De: /^[🔴🟡🟢🔵⚪◆◇●○■□▪▫✦✧⬥⬦♦️◈]\s*/
// Para: /^[^\w\sÀ-ú-]+\s*/u
```

Isso captura qualquer prefixo de símbolos/emojis sem depender de lista exaustiva de caracteres Unicode.

