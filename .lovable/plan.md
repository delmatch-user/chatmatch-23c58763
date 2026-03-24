

# Corrigir roteamento de resposta: Meta API vs Baileys

## Problema

Quando uma conversa chega pela **API Oficial (Meta)**, ao responder, o sistema roteia a mensagem pelo **Baileys** (número QR Code) ao invés da API Oficial. Isso faz a resposta sair pelo número errado e o Meta cria uma nova conversa duplicada.

**Causa raiz**: A função `getConnectionForDepartment()` em `useWhatsAppSend.tsx` **sempre prioriza Baileys sobre Meta API**, independentemente de qual canal originou a conversa. Se o lookup por `whatsappInstanceId` falhar por qualquer motivo (status diferente, ID não encontrado), o fallback ignora a origem e pega Baileys.

## Solução

Duas correções no arquivo `src/hooks/useWhatsAppSend.tsx`:

### 1. Tornar o lookup por instanceId mais robusto

Na função `getConnectionByInstanceId`, remover o filtro de status para que encontre a conexão Meta API mesmo se o status não for exatamente `connected/active`:

```typescript
// Antes: .in('status', ['connected', 'active'])
// Depois: buscar sem filtro de status, priorizando ativas
async function getConnectionByInstanceId(instanceId: string) {
  // Primeiro tentar com status ativo
  const { data } = await supabase
    .from('whatsapp_connections')
    .select(...)
    .eq('phone_number_id', instanceId)
    .in('connection_type', ['baileys', 'meta_api'])
    .in('status', ['connected', 'active'])
    .limit(1).maybeSingle();
  
  if (data) return data;
  
  // Fallback: qualquer status (Meta API pode ter status diferente)
  const { data: fallback } = await supabase
    .from('whatsapp_connections')
    .select(...)
    .eq('phone_number_id', instanceId)
    .in('connection_type', ['baileys', 'meta_api'])
    .limit(1).maybeSingle();
  
  return fallback;
}
```

### 2. Respeitar o canal da conversa no fallback por departamento

Na lógica principal de `sendMessage`, quando o `whatsappInstanceId` não resolve mas a conversa tem canal definido, buscar pelo tipo de conexão correto:

```typescript
// Após falha do instanceId, antes do fallback por departamento:
// Se a conversa tem whatsappInstanceId definido (veio da Meta), 
// forçar busca por meta_api no departamento
if (!connection && whatsappInstanceId && departmentId) {
  // O instanceId não resolveu, mas sabemos que veio da Meta API
  // Buscar conexão meta_api para o departamento
  connection = await getMetaConnectionForDepartment(departmentId);
}
```

Criar uma função `getMetaConnectionForDepartment` que busca exclusivamente conexões `meta_api` (sem priorizar Baileys).

### 3. Fallback final que respeita a origem

Se mesmo assim não encontrar, e o `whatsappInstanceId` estava definido (indicando que veio da Meta), buscar qualquer conexão Meta API ativa em vez de qualquer Baileys.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useWhatsAppSend.tsx` | Tornar `getConnectionByInstanceId` mais robusto; adicionar lógica de fallback que respeita o canal da conversa; criar `getMetaConnectionForDepartment` |

