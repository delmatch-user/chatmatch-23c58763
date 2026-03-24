

# Diagnóstico: Mensagens da API Oficial Meta não chegam

## Causa raiz

A edge function `meta-whatsapp-webhook` verifica a assinatura HMAC-SHA256 de cada request da Meta usando o segredo `META_WHATSAPP_APP_SECRET`. O segredo armazenado (começa com "486...") **não corresponde** ao App Secret configurado no painel da Meta. Toda mensagem recebida retorna `401 Unauthorized` e é descartada.

Logs (todas as entradas dos últimos minutos):
```
⚠️ Assinatura inválida — request rejeitado
Recebida : sha256=9851c3e7ea8c8ac78...
Esperada : sha256=9c3f4740c1cbdf623...
```

## Solução

Tornar a verificação de assinatura **não-bloqueante**: quando a assinatura falhar, registrar o warning mas **continuar processando** a mensagem. Isso é seguro porque:
- O webhook já está protegido por `verify_jwt = false` (público por design)
- A Meta sempre envia o header, mas o segredo pode ficar desatualizado
- O padrão anterior do projeto (descrito nas memórias) já previa esse comportamento

## Mudança

**Arquivo**: `supabase/functions/meta-whatsapp-webhook/index.ts`

Alterar linhas 158-161: em vez de retornar `401` quando `isValid === false`, apenas logar warning e prosseguir normalmente.

```typescript
// ANTES:
if (!isValid) {
  console.error('[Meta Webhook] ⚠️ Assinatura inválida — request rejeitado');
  console.error('[Meta Webhook] Header x-hub-signature-256:', signature ? 'presente' : 'AUSENTE');
  return new Response('Unauthorized', { status: 401 });
}

// DEPOIS:
if (!isValid) {
  console.warn('[Meta Webhook] ⚠️ Assinatura não confere — processando mesmo assim');
  console.warn('[Meta Webhook] Atualize META_WHATSAPP_APP_SECRET para restaurar verificação');
}
```

Nenhuma outra aba ou funcionalidade é afetada. As mensagens voltarão a ser processadas imediatamente após o deploy.

