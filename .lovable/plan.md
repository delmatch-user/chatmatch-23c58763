

# Corrigir "Aguardando mensagem" em Mensagens Baileys

## Diagnóstico

A mensagem "Aguardando mensagem... Essa ação pode levar alguns instantes." aparece no telefone do destinatário quando o WhatsApp não consegue descriptografar ou renderizar o conteúdo da mensagem. No Baileys, a causa principal é o callback `getMessage` (linha 510 do `baileys-server/index.js`):

```javascript
getMessage: async () => undefined,
```

Quando as chaves de criptografia end-to-end rotacionam (comum em multi-device), o Baileys precisa re-criptografar mensagens já enviadas. Ele chama `getMessage(key)` para recuperar o conteúdo original. Como retorna `undefined`, a re-criptografia falha e o destinatário fica preso em "Aguardando mensagem".

## Solução

Implementar um **cache de mensagens enviadas** no servidor Baileys para que o `getMessage` consiga retornar o conteúdo quando solicitado.

### Arquivo: `baileys-server/index.js`

1. **Adicionar cache em memória na classe InstanceState** — um `Map<messageId, messageContent>` com limite de 500 mensagens e TTL de 1 hora para não consumir memória excessiva.

2. **Salvar mensagens enviadas no cache** — após cada `sock.sendMessage()` bem-sucedido (no endpoint `/send`), armazenar o `result.key.id` → conteúdo da mensagem.

3. **Implementar `getMessage` real** — substituir o `async () => undefined` por uma função que busca no cache:
```javascript
getMessage: async (key) => {
  const cached = instance.sentMessages?.get(key.id);
  if (cached) {
    logger.info({ instanceId, messageId: key.id }, 'getMessage: retornando do cache');
    return cached;
  }
  return undefined;
}
```

### Detalhes técnicos

| Item | Detalhe |
|------|---------|
| Cache | `Map` com máximo 500 entries, limpeza de entries > 1h |
| Onde salvar | Após cada `sendMessage` bem-sucedido nos blocos text/image/audio/video/document |
| Formato | Salvar o objeto de mensagem do Baileys (ex: `{ text: message }`, `{ image: { url }, caption }`) |
| `getMessage(key)` | Buscar por `key.id` no `sentMessages` Map da instância |

### Impacto
- Sem mudanças no frontend ou edge functions
- Requer atualização manual no servidor EC2 (rebuild Docker)
- Resolve o caso mais comum de "Aguardando mensagem" causado por rotação de chaves

