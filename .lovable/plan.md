

# Conversas da API Oficial Nao Caem na Fila — Diagnostico e Correcao

## Diagnostico

Apos analise detalhada, identifiquei **dois problemas distintos**:

### Problema 1: Webhook Meta nao esta recebendo eventos

**Evidencia:** A ultima mensagem da API oficial (external_id com prefixo `wamid.`) foi em **16 de marco** — 10 dias atras. Os logs da Edge Function `meta-whatsapp-webhook` mostram apenas eventos "shutdown", nenhum "boot" ou processamento. Isso significa que **a Meta nao esta enviando webhooks** para a URL da funcao.

**Causa provavel:** A conexao Meta API tem `status: active` (nao `connected`), e o ultimo update foi em 12 de marco. Possivelmente:
- O webhook URL configurado no Meta Business Manager expirou ou foi desconfigurado
- O token de acesso Meta expirou
- A assinatura do app Meta foi desativada

**Correcao:** Isso e um problema de configuracao **externa** (Meta Business Manager), nao de codigo. Voce precisa:
1. Acessar o Meta Business Manager > App > Webhooks
2. Verificar se a URL do webhook esta correta: `https://jfbixwfioehqkussmhov.supabase.co/functions/v1/meta-whatsapp-webhook`
3. Revalidar a assinatura do webhook
4. Verificar se o token de acesso ainda e valido

### Problema 2: Insert de conversa pode falhar silenciosamente

No codigo (linhas 375-394), quando a criacao de conversa falha (ex: constraint `uq_active_conversation_per_contact` se o contato ja tem conversa ativa via Baileys), o webhook faz `continue` e **perde a mensagem** sem log adequado.

**Correcao no codigo:** Adicionar tratamento para o caso de erro `23505` (unique violation) no insert de conversa — buscar a conversa ativa existente e continuar processando a mensagem nela.

### Problema 3: Log e rastreabilidade

Nao ha como saber retrospectivamente quais mensagens foram perdidas. Precisamos adicionar logs mais detalhados.

## Mudancas no Codigo

### `supabase/functions/meta-whatsapp-webhook/index.ts`

1. **Tratar erro 23505 no insert de conversa** (linhas 391-394):
   - Se `convError.code === '23505'`, buscar a conversa ativa existente por `contact_id` e continuar
   - Log explicativo: "Conversa ja existente para contato, reutilizando"

2. **Adicionar logs de diagnostico no inicio**:
   - Log do `phone_number_id` recebido vs conexoes disponiveis
   - Log quando nenhuma mensagem e processada em um batch

3. **Atualizar status da conexao Meta** para `connected` quando receber webhook com sucesso (opcional, para monitoramento)

## Acao Imediata do Usuario

O problema principal e **externo ao codigo** — o webhook Meta precisa ser reconfigurado. Apos a correcao de codigo, voce deve:
1. Verificar no Meta Business Manager se o webhook URL esta ativo
2. Testar enviando uma mensagem para o numero da API Oficial
3. Observar os logs da Edge Function para confirmar que eventos estao chegando

## Arquivos a editar

| # | Arquivo | Mudanca |
|---|---------|---------|
| 1 | `supabase/functions/meta-whatsapp-webhook/index.ts` | Tratar unique violation no insert + logs de diagnostico |

