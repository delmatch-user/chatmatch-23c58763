

## Plano: Substituir tags "normal" por taxonomia e automatizar classificação na finalização humana

### O que será feito

**1. Atualizar 50 últimas conversas de atendentes humanos (one-time)**
Criar e executar uma edge function `classify-conversation-tags` que:
- Busca as 50 últimas `conversation_logs` do departamento Suporte onde `finalized_by IS NOT NULL` (humano) e tags não contêm nenhuma tag de taxonomia
- Analisa o conteúdo das mensagens de cada conversa usando IA (Gemini Flash) em batch
- Classifica cada conversa em uma das 5 tags: `Acidente - Urgente`, `Operacional - Pendente`, `Financeiro - Normal`, `Duvida - Geral`, `Comercial - B2B`
- Atualiza `tags` e `priority` de cada log

**2. Automatizar classificação na finalização por humano**
No `useConversations.tsx`, após criar o log em `finalizeConversation`:
- Verificar se o departamento é Suporte
- Se a conversa já tem uma tag de taxonomia (veio da triagem do robô), manter
- Se não tem, chamar a edge function `classify-conversation-tags` passando o ID do log recém-criado para classificar assincronamente (fire-and-forget, não bloqueia o atendente)

**3. Atualizar History.tsx**
- Substituir o badge de `priority` (normal/urgent) pelo badge de taxonomy tag, igual ao que já foi feito no AILogs.tsx

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/classify-conversation-tags/index.ts` | **Novo** - Edge function que classifica logs via IA |
| `src/hooks/useConversations.tsx` | Após inserir log, chamar classificação assíncrona se Suporte e sem tag |
| `src/pages/History.tsx` | Trocar badge `priority` por badge de taxonomy tag com cores |

### Detalhes técnicos

**Edge function `classify-conversation-tags`:**
- Aceita `{ logIds?: string[], batchSize?: number }` 
- Se `logIds` fornecido: classifica logs específicos
- Se não: busca últimos 50 logs humanos do Suporte sem tag de taxonomia
- Para cada log, extrai primeiras mensagens do cliente e resposta, envia para Gemini Flash com prompt de classificação que retorna JSON `{ tag, priority }`
- Processa em lotes de 10 para eficiência (um prompt com múltiplas conversas)
- Atualiza cada `conversation_logs` com a tag e priority

**Fluxo na finalização humana:**
```typescript
// Após inserir o log com sucesso
if (conversation.departmentId === SUPORTE_DEPARTMENT_ID) {
  const hasTaxonomyTag = conversation.tags?.some(t => 
    SUPORTE_TAXONOMY_TAGS.includes(t)
  );
  if (!hasTaxonomyTag) {
    // Fire-and-forget - não bloqueia
    supabase.functions.invoke('classify-conversation-tags', {
      body: { logIds: [newLogId] }
    });
  }
}
```

**History.tsx - Badge:**
```typescript
const taxonomyTag = log.tags?.find(t => SUPORTE_TAXONOMY_TAGS.includes(t));
// Mostra taxonomy tag colorida se existir, senão fallback para priority
```

