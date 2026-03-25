

# Auto-finalizar conversas Meta API >24h como robô Delma

## Problema
Conversas vindas da API Oficial do WhatsApp (Meta) geram erro ao tentar responder após 24h (erro 131047). Essas conversas devem ser finalizadas automaticamente como robô "Delma".

## Solução
Adicionar uma **5ª varredura** na edge function `sync-robot-schedules` que:

1. Busca conversas `em_atendimento` ou `pendente` que vieram da **Meta API** (identificadas por `whatsapp_instance_id = '428510647008415'` ou conexão `meta_api`)
2. Verifica se a **última mensagem** tem mais de **24 horas**
3. Finaliza como robô **Delma** (`e0886607-cf54-4687-a440-4fa334085606`), salvando log com `finalized_by_name: "Delma [AUTO-24H]"`
4. **Não envia protocolo** (Meta rejeitaria a mensagem por janela expirada)

## Arquivo

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/sync-robot-schedules/index.ts` | Adicionar varredura de conversas Meta API >24h após a 4ª varredura existente |

## Lógica da nova varredura

```text
Para cada conversa em (em_atendimento, pendente):
  - Tem whatsapp_instance_id?
  - Esse instance_id pertence a uma whatsapp_connection com connection_type = 'meta_api'?
  - A última mensagem (qualquer remetente) foi há >24h?
  → Sim: salvar log (finalized_by_name = "Delma [AUTO-24H]"), deletar msgs + conversa
  → Não: pular
```

Não envia mensagem de protocolo pois a janela Meta já expirou. O log no histórico identificará claramente que foi auto-finalizado por limite de 24h da API oficial.

