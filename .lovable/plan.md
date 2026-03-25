

# Corrigir Erro #131000 — Janela de 24h Expirada na Meta API

## Diagnóstico

Os logs mostram o erro `#131000 (OAuthException)` da Meta API. Isso **não é um bug de código** — é a Meta bloqueando envio de mensagens para contatos cuja janela de 24 horas expirou. As mensagens que falharam são todas de finalização (protocolo + despedida) para números `5516988580985` e `5514991710263`.

O código atual já trata o erro no fluxo de finalização (try/catch na linha 288 do ChatPanel), então a finalização prossegue mesmo quando o envio falha. Porém, o problema é que:

1. A mensagem de protocolo é salva no banco como "enviada" mesmo quando a API rejeita
2. Aparece "Reenviar" na UI, confundindo o atendente
3. Não há feedback claro de que a janela expirou

## Solução

### 1. Edge Function `meta-whatsapp-send/index.ts` — Retornar erro tipado

Quando a Meta retorna erro `131000`, retornar um response com `errorCode: 'WINDOW_EXPIRED'` em vez de erro genérico 500. Isso permite que o frontend trate especificamente.

```typescript
if (!response.ok) {
  const errorCode = responseData.error?.code;
  const isWindowExpired = errorCode === 131000;
  
  return new Response(
    JSON.stringify({
      success: false,
      error: responseData.error?.message || 'Erro ao enviar mensagem',
      errorCode: isWindowExpired ? 'WINDOW_EXPIRED' : 'API_ERROR',
      metaCode: errorCode
    }),
    {
      status: isWindowExpired ? 403 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}
```

### 2. `ChatPanel.tsx` — Tratar janela expirada na finalização

No bloco de envio de protocolo (linhas 273-290), verificar se o erro retornado é `WINDOW_EXPIRED` e, nesse caso, não persistir a mensagem no banco e apenas logar silenciosamente (a finalização já continua normalmente).

### 3. `useWhatsAppSend.tsx` — Propagar errorCode da Meta

Na função `sendViaMeta`, incluir o `errorCode` no resultado para que o ChatPanel possa distinguir janela expirada de erros reais.

## Arquivos a editar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/meta-whatsapp-send/index.ts` | Retornar `errorCode: 'WINDOW_EXPIRED'` para erro 131000 em vez de throw genérico |
| `src/components/chat/ChatPanel.tsx` | No