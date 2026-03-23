

## Plano: Adicionar classificação de tag na finalização por IA e corrigir filtro

### Problema
Todas as conversas no Logs IA mostram "normal" porque o `finalize_conversation` no robot-chat não pede uma tag de taxonomia — apenas o `transfer_to_human` faz isso. As conversas finalizadas pelo robô ficam sem classificação.

Além disso, o filtro de tags no dropdown não considera tags no formato antigo (ex: `🔴 ACIDENTE_URGENTE`), e os itens do filtro não mostram cores.

### Correções

**1. Arquivo: `supabase/functions/robot-chat/index.ts`**

Adicionar `taxonomy_tag` como parâmetro obrigatório no tool `finalize_conversation` (mesma enum do `transfer_to_human`). Na execução do tool, salvar a tag na conversa antes de criar o log — idêntico ao que já é feito em `transfer_to_human`.

- Adicionar campo `taxonomy_tag` com enum das 5 tags ao schema do tool (linhas ~544-556)
- Na execução (linhas ~1616-1736), antes de inserir o `conversation_logs`:
  - Ler `taxonomy_tag` dos args (fallback `'Duvida - Geral'`)
  - Adicionar tag ao array `convProto?.tags`
  - Atualizar priority para `'urgent'` se tag for `'Acidente - Urgente'`

**2. Arquivo: `src/pages/AILogs.tsx`**

- No filtro de tags, adicionar suporte a tags no formato antigo: quando o usuário seleciona uma tag nova (ex: `Acidente - Urgente`), o filtro deve também encontrar logs com a tag antiga correspondente (ex: `🔴 ACIDENTE_URGENTE`)
- Adicionar indicador visual de cor nas opções do `Select` de tags (dot colorido ao lado do nome)

**3. Arquivo: `src/lib/tagColors.ts`**

- Exportar um mapa de correspondência `LEGACY_TAG_MAP` que relaciona tags novas às antigas para uso no filtro

### Detalhes técnicos

No `finalize_conversation` tool schema:
```
taxonomy_tag: {
  type: "string",
  description: "Tag de classificação do atendimento",
  enum: ["Acidente - Urgente", "Operacional - Pendente", "Financeiro - Normal", "Duvida - Geral", "Comercial - B2B"]
}
```

No filtro do AILogs, a lógica de match será:
```typescript
if (tagFilter !== 'all') {
  const legacyTag = LEGACY_TAG_MAP[tagFilter];
  if (!log.tags?.some(t => t === tagFilter || t === legacyTag)) return false;
}
```

### Resultado
- Novas conversas finalizadas pelo robô terão tag de taxonomia classificada automaticamente
- O filtro de tags funcionará para tags novas e antigas
- As opções do filtro mostrarão cores correspondentes

