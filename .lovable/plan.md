

## Plano: Sincronizar cores das tags em todos os componentes

### Problema
Os componentes `QueueCard.tsx` e `ConversationList.tsx` usam classes CSS hardcoded para apenas 3 tags (`urgente`, `novo`, `retorno`), ignorando completamente as tags de taxonomia do Suporte (`Acidente - Urgente`, `Operacional - Pendente`, etc.). Resultado: as tags aparecem sem cor, como na screenshot.

Os componentes `ContactDetails.tsx`, `AILogs.tsx`, `History.tsx` e `AdminConversationLogs.tsx` já usam `getTagColorClasses()` corretamente.

### Correções

#### 1. `src/components/queue/QueueCard.tsx` (linha ~193-206)
- Importar `getTagColorClasses` de `@/lib/tagColors`
- Substituir as classes hardcoded por `getTagColorClasses(tag)` com fallback para as tags antigas (`urgente`, `novo`, `retorno`)

#### 2. `src/components/chat/ConversationList.tsx` (linha ~829-841)
- Importar `getTagColorClasses` de `@/lib/tagColors`
- Substituir as classes hardcoded por `getTagColorClasses(tag)` com o mesmo fallback

#### 3. `src/lib/tagColors.ts`
- Adicionar as tags simples `urgente`, `novo`, `retorno` ao `TAG_COLOR_MAP` para manter compatibilidade com conversas que usam essas tags legadas

### Resultado
Todas as telas (fila, lista de conversas, detalhes do contato, logs IA, histórico) exibirão as tags com cores consistentes, refletindo corretamente as prioridades definidas pelos robôs.

