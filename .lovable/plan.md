

## Plano: Remover tags legadas e normalizar para formato novo em todo o sistema

### Problema
Tags no formato antigo (ex: `🔴 ACIDENTE_URGENTE`, `◆ OPERACIONAL_PENDENTE`) ainda aparecem na UI porque os dados do banco contêm esses formatos antigos. O sistema precisa normalizar tudo para o formato novo (`Acidente - Urgente`, etc.) e eliminar referências ao formato legado.

### Mudanças

| Arquivo | O que muda |
|---------|-----------|
| `src/lib/tagColors.ts` | Remover `LEGACY_TAG_MAP`. Remover entradas com emoji do `TAG_COLOR_MAP` e `TAG_DOT_COLOR_MAP`. Adicionar e exportar função `normalizeTag()` centralizada que converte qualquer formato antigo para o novo. |
| `src/pages/admin/AdminBrain.tsx` | Remover `TAG_NORMALIZATION` local e `normalizeTag` local. Importar `normalizeTag` de `tagColors.ts`. Adicionar `OPERACIONAL_PENDENTE` → `Duvida - Geral` no mapa de normalização. |
| `src/pages/AILogs.tsx` | Remover import de `LEGACY_TAG_MAP`. No filtro de tags, usar `normalizeTag()` para comparar tags normalizadas em vez de checar o formato legado. |
| `src/pages/History.tsx` | Se exibe tags raw, aplicar `normalizeTag()` antes de renderizar. |

### Detalhes técnicos

**`normalizeTag` centralizado em `tagColors.ts`:**
```typescript
const TAG_NORMALIZATION: Record<string, string> = {
  'ACIDENTE_URGENTE': 'Acidente - Urgente',
  'FINANCEIRO_NORMAL': 'Financeiro - Normal',
  'DUVIDA_GERAL': 'Duvida - Geral',
  'COMERCIAL_B2B': 'Comercial - B2B',
  'OPERACIONAL_PENDENTE': 'Duvida - Geral', // Legado → absorvido
};

export function normalizeTag(tag: string): string {
  const clean = tag.replace(/^[🔴🟡🟢🔵⚪◆◇●○■□▪▫✦✧⬥⬦♦️◈]\s*/, '').trim();
  return TAG_NORMALIZATION[clean] || clean;
}
```

- `getTagColorClasses` e `getTagDotColor` passam a chamar `normalizeTag` internamente antes do lookup — assim qualquer formato antigo recebe a cor correta sem duplicar entradas.
- `LEGACY_TAG_MAP` é removido — não há mais necessidade de manter dois formatos.
- No `AdminBrain.tsx`, a normalização já acontece no `filterMetrics` via `normalizeTag` — só precisa importar do local centralizado e remover a versão local.
- No `AILogs.tsx`, o filtro de tag passa a normalizar cada tag do log antes de comparar: `log.tags?.some(t => normalizeTag(t) === tagFilter)`.

