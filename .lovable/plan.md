

## Diagnóstico: Conversas caindo no departamento errado

### Causa raiz

No webhook (`whatsapp-webhook/index.ts`, linha 502), a busca pela conexão Baileys para determinar o departamento filtra por `status = 'connected'`:

```typescript
.eq('status', 'connected')   // ← PROBLEMA
.eq('phone_number_id', effectiveInstanceId)
```

Pela imagem, ambas as instâncias ("suporte" e "comercial") estão conectadas agora. Porém, quando uma instância momentaneamente cai e reconecta, o status fica `disconnected` no banco durante esse intervalo. Nesse momento, qualquer mensagem recebida não encontra o mapeamento instância→departamento e cai no **fallback** (linhas 1033-1042) que pega o primeiro departamento da tabela — resultando em roteamento errado (ex: Administrativo em vez de Suporte).

O mapeamento instância→departamento é uma configuração estática e não deve depender do status de conexão.

### Correção proposta

**Arquivo:** `supabase/functions/whatsapp-webhook/index.ts`

**Única alteração:** Remover `.eq('status', 'connected')` da query que busca o `department_id` pela conexão Baileys (linha 502).

Isso garante que:
- A instância "suporte" sempre roteie para o departamento Suporte
- A instância "comercial" sempre roteie para o departamento Comercial
- Nenhuma conversa nova será enviada para um departamento diferente do configurado
- Transferências continuam sendo feitas apenas por atendentes ou IA, como esperado

Nenhuma outra lógica será alterada — o webhook continuará respeitando o departamento da conexão sem mudar conversas existentes nem fazer transferências automáticas.

