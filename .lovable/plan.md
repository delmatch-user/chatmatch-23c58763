

# Avisar o cliente sobre transferencia e evitar mensagens duplicadas

## Problema 1: Transferencia silenciosa
Quando a Delma transfere para Sebastiao ou Julia via `transfer_to_robot`, o codigo limpa `aiResponse = ''` e seta `skipSending = true` (linhas 1671-1672). O campo `message_to_client` dos argumentos da tool e completamente ignorado. O cliente nao recebe nenhum aviso de que esta sendo transferido.

## Problema 2: Mensagens duplicadas do robo destino
Apos a transferencia, o `robot-chat` do destino e chamado via fire-and-forget `fetch` (linha 1676). Porem, se uma nova mensagem do cliente chega durante o processo, o webhook tambem aciona `robot-chat` para o mesmo robo/conversa, gerando resposta duplicada. O lock (`robot_lock_until`) e resetado para `null` na transferencia (linha 1644), deixando a porta aberta.

## Correcoes

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/robot-chat/index.ts` | Enviar `message_to_client` ao cliente antes de transferir para outro robo + setar lock no destino para evitar duplicatas |

### Detalhes tecnicos

**Bloco `transfer_to_robot` (linhas 1628-1698):**

1. **Enviar aviso ao cliente**: Antes de chamar o robo destino, enviar `args.message_to_client` (ex: "Vou te transferir para o Sebastiao, nosso especialista") via WhatsApp/Machine e salvar no DB. Isso informa o cliente sobre a transferencia.

2. **Setar lock no destino**: Em vez de `robot_lock_until: null`, setar um lock de 5 segundos (`new Date(Date.now() + 5000).toISOString()`) na conversa ao transferir. Isso garante que o webhook nao acione o robo destino em paralelo enquanto o `fetch` interno ainda esta processando.

3. **Manter `skipSending = true` para a resposta da IA**: O `aiResponse` continua vazio — apenas o `message_to_client` e enviado explicitamente. O robo destino responde normalmente apos o lock.

Logica simplificada:
```
// Antes de transferir:
const transferMsg = args.message_to_client || `Vou transferir voce para ${targetRobot.name}`;
// Enviar via WhatsApp/Machine
// Salvar no DB como mensagem do robo atual
// Setar robot_lock_until = now + 5s (evita duplicata)
// Chamar robot-chat do destino com isTransfer: true
```

