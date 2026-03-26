

# Corrigir Falsos Positivos de "Mensagem Apagada"

## Diagnóstico

No `baileys-server/index.js`, a detecção de mensagens apagadas está com critérios amplos demais, marcando mensagens normais como deletadas:

**Problema 1** (linha 743): `protocolMsg.type === 5` está incluído na detecção de revogação. No Baileys, type 5 = `MESSAGE_EDIT` (edição de mensagem), NÃO deleção. Mensagens editadas pelo cliente estão sendo tratadas como apagadas.

**Problema 2** (linha 764): `stubType === 1` está incluído na detecção. No Baileys, stubType 1 = `CIPHERTEXT` (placeholder de mensagem criptografada que não foi descriptografada), NÃO uma deleção. Isso causa falsos positivos em massa.

## Solução

### Arquivo: `baileys-server/index.js`

**Correção 1** — Remover `protocolMsg.type === 5` da checagem de revogação (linha 741-743):
```javascript
// ANTES:
const isRevoke = protocolMsg.type === 0 || 
                 protocolMsg.type === 'REVOKE' || 
                 protocolMsg.type === 5;

// DEPOIS:
const isRevoke = protocolMsg.type === 0 || 
                 protocolMsg.type === 'REVOKE';
```

**Correção 2** — Remover `stubType === 1` da checagem no `messages.upsert` (linha 764):
```javascript
// ANTES:
if (stubType === 1 || stubType === 2) {

// DEPOIS:
if (stubType === 2) {
```

**Correção 3** — Mesma correção no `messages.update` (linha 1142-1143):
```javascript
// ANTES:
const isRevoke = stubType === 1 || stubType === 2;

// DEPOIS:
const isRevoke = stubType === 2;
```

## Impacto
- Apenas 3 linhas alteradas no servidor Baileys
- Nenhuma mudança no frontend ou Edge Functions
- Requer rebuild do Docker no EC2
- Mensagens que já foram marcadas incorretamente como `deleted: true` no banco continuarão aparecendo assim (pode ser corrigido com um UPDATE manual se necessário)

