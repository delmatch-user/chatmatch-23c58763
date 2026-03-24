

# Incluir dados de conversas reais no prompt quando há observação manual

## Problema

O gestor pede "Qual foi a primeira mensagem enviada pelo Alex nas últimas 4h e qual cliente ele respondeu", mas a Delma só recebe métricas agregadas (contagens, TMA, TME). A tabela `conversation_logs` tem uma coluna `messages` (jsonb) com o conteúdo real das conversas, mas esses dados nunca são incluídos no prompt.

## Solução

Quando `reqUserContext` está presente (observação manual), incluir no prompt um bloco com as **conversas reais** dos agentes — contato, horário, e as primeiras mensagens de cada conversa. Isso permite à Delma responder perguntas específicas sobre conteúdo.

## Mudança

**Arquivo**: `supabase/functions/brain-analysis/index.ts`

1. **Quando `reqUserContext` existe**, construir um bloco `conversationDetailsBlock` com dados das conversas reais do período:
   - Para cada conversa do Suporte: nome do agente, nome do contato, telefone, horário de início/fim, e as primeiras 3-5 mensagens (sender + content + timestamp)
   - Limitar a ~100 conversas para não estourar o contexto do modelo
   - Incluir esse bloco no `userMessage` junto com o `metricsBlock`

2. **Quando `reqUserContext` está vazio**, manter o comportamento atual (só métricas agregadas)

### Lógica do bloco de conversas

```typescript
// Só quando há observação manual
let conversationDetailsBlock = '';
if (reqUserContext) {
  const detailLogs = logs
    .filter(l => l.assigned_to_name && l.department_name?.toLowerCase() === 'suporte')
    .slice(0, 100);
  
  conversationDetailsBlock = detailLogs.map(l => {
    const msgs = Array.isArray(l.messages) ? l.messages.slice(0, 5) : [];
    const msgLines = msgs.map((m: any) => 
      `    [${m.created_at || m.timestamp || ''}] ${m.sender_name || m.sender || 'Desconhecido'}: ${(m.content || m.text || '').substring(0, 200)}`
    ).join('\n');
    return `Conversa: ${l.contact_name} (${l.contact_phone || 'sem telefone'})
  Agente: ${l.assigned_to_name}
  Início: ${l.started_at} | Fim: ${l.finalized_at}
  Tags: ${(l.tags || []).join(', ')}
  Mensagens:
${msgLines || '    (sem mensagens)'}`;
  }).join('\n---\n');
}
```

3. **Atualizar o `userMessage`** quando há observação para incluir as conversas:

```typescript
const userMessage = reqUserContext
  ? `## SOLICITAÇÃO DO GESTOR (PRIORIDADE MÁXIMA):\n\n${reqUserContext}\n\n---\n\n${metricsBlock}\n\n**Conversas detalhadas do período:**\n${conversationDetailsBlock}`
  : // prompt padrão atual
```

Isso garante que quando o gestor perguntar sobre mensagens específicas, contatos ou interações de um agente, a Delma terá acesso ao conteúdo real das conversas.

