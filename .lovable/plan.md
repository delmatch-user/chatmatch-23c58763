

## Plano: Renomear tags de taxonomia do Suporte

As tags ainda estão no formato antigo. Aqui está o que será alterado:

### Arquivo: `src/lib/tagColors.ts`
Renomear em `SUPORTE_TAXONOMY_TAGS`, `TAG_COLOR_MAP` e `TAG_DOT_COLOR_MAP`:

| Atual | Novo |
|---|---|
| `🔴 ACIDENTE_URGENTE` | `Acidente - Urgente` |
| `🟠 OPERACIONAL_PENDENTE` | `Operacional - Pendente` |
| `🔵 FINANCEIRO_NORMAL` | `Financeiro - Normal` |
| `🟢 DUVIDA_GERAL` | `Duvida - Geral` |
| `🟡 COMERCIAL_B2B` | `Comercial - B2B` |

### Arquivo: `supabase/functions/robot-chat/index.ts`
Atualizar as referências às tags no prompt do robô e na lógica de classificação.

### Verificar também
- `src/pages/AILogs.tsx` (filtro por tag)
- `src/pages/History.tsx` (se referencia as tags)
- `supabase/functions/sdr-robot-chat/index.ts` (se usa essas tags)

