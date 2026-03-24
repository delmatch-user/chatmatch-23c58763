

## Plano: Classificacao inteligente Estabelecimento vs Motoboy nas Conversas Problematicas

### Problema atual

A classificacao atual verifica apenas se a tag "Estabelecimento" ou "Motoboy" existe no array `tags[]` do log. Como muitas conversas nao tem essas tags, a maioria cai em "Outros". O usuario indica que o tipo do contato normalmente e mencionado na conversa ou nas notas do contato.

### O que muda

**1. Edge function `brain-analysis/index.ts` — classificacao enriquecida**

A funcao `classifyType` passara a analisar tres fontes em cascata:
1. Tags (como ja faz) — se tem tag "Estabelecimento" ou "Motoboy"
2. `contact_notes` — buscar palavras-chave como "estabelecimento", "loja", "restaurante", "comercio" → estabelecimento; "motoboy", "entregador", "motoqueiro", "motoca" → motoboy
3. Conteudo das mensagens salvas no log (`messages` jsonb) — varrer o texto das primeiras mensagens procurando as mesmas palavras-chave

Prioridade: tags > notes > mensagens. Primeira match define o tipo.

**2. Frontend `AdminBrain.tsx` — sem mudanca estrutural**

A UI ja tem as sub-tabs e o grafico. A unica mudanca e que os dados virao melhor classificados do backend, reduzindo o bucket "Outros".

### Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/brain-analysis/index.ts` | Reescrever `classifyType` para analisar tags + contact_notes + mensagens com palavras-chave |

### Detalhes tecnicos

```typescript
const ESTAB_KEYWORDS = ['estabelecimento', 'loja', 'restaurante', 'comercio', 'comércio', 'mercado', 'padaria', 'farmacia', 'farmácia'];
const MOTOBOY_KEYWORDS = ['motoboy', 'entregador', 'motoqueiro', 'motoca', 'bike', 'biker', 'moto boy'];

function classifyType(log: any): string {
  const tags = log.tags || [];
  // 1. Check tags
  if (tags.some(t => t === 'Estabelecimento')) return 'estabelecimento';
  if (tags.some(t => t === 'Motoboy')) return 'motoboy';
  
  // 2. Check contact_notes
  const notes = (log.contact_notes || '').toLowerCase();
  if (ESTAB_KEYWORDS.some(k => notes.includes(k))) return 'estabelecimento';
  if (MOTOBOY_KEYWORDS.some(k => notes.includes(k))) return 'motoboy';
  
  // 3. Check first messages content
  const msgs = (log.messages || []).slice(0, 10);
  const msgText = msgs.map(m => (m.content || '').toLowerCase()).join(' ');
  if (ESTAB_KEYWORDS.some(k => msgText.includes(k))) return 'estabelecimento';
  if (MOTOBOY_KEYWORDS.some(k => msgText.includes(k))) return 'motoboy';
  
  return 'outros';
}
```

O campo `messages` ja esta disponivel no `errorLogs` pois o SELECT da edge function faz `select("*")` nos `conversation_logs`, que inclui a coluna `messages` (jsonb). Basta utiliza-lo na classificacao sem precisar buscar dados adicionais.

