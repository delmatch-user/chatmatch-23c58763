

## Correções para Sincronização dos Robôs

### Problemas Encontrados

1. **Os 3 robôs estão `paused`** — nenhum está ativo para funcionar
2. **Delma não tem horário configurado** — o cron `sync_robot_statuses` nunca a ativa automaticamente
3. **Júlia e Sebastião têm horário 01:00–09:00** — fora desse horário são pausados automaticamente pelo cron, ficando indisponíveis para receber transferências
4. **Bug no `transfer_to_robot`**: a query que lista robôs disponíveis para transferência filtra `status = 'active'`. Quando Júlia/Sebastião são pausados pelo cron (fora do horário 01:00–09:00), eles **desaparecem das opções** de transferência da Delma
5. **Nenhum dos 3 robôs tem documentos na Base de Consulta** (`ref_count = 0`)

### Plano de Correção

**1. Corrigir query de robôs disponíveis para transferência (`robot-chat`)**
- Alterar a query `availableRobotsForTransfer` para incluir robôs com `auto_assign = false` independente do status (especialistas devem estar sempre disponíveis para transferência)
- Linha ~919: mudar de `.eq('status', 'active')` para incluir robôs especialistas

**2. Ativar os 3 robôs via migration**
- Delma: `status = 'active'`, `manually_activated = true`
- Júlia: `status = 'active'`, `manually_activated = true`  
- Sebastião: `status = 'active'`, `manually_activated = true`
- `manually_activated = true` impede que o cron os pause fora do horário

**3. Proteger especialistas do cron de pausa**
- Atualizar `sync_robot_statuses()` (função PL/pgSQL) para não pausar robôs com `auto_assign = false`
- Robôs especialistas não pegam da fila, então não faz sentido o cron pausá-los

**4. Base de Consulta**
- Os documentos TXT/PDF precisam ser adicionados manualmente via UI (aba "Base de conhecimento")
- Nenhuma mudança de código necessária — apenas alertar o usuário

### Arquivos modificados

- `supabase/functions/robot-chat/index.ts` — query `availableRobotsForTransfer` (linha ~919)
- **Migration SQL** — ativar robôs + atualizar função `sync_robot_statuses()` para ignorar especialistas
- Nenhuma mudança no frontend necessário

### Resultado esperado

```text
Delma (ativa, auto_assign=true)
  ├── Sempre disponível para pegar conversas da fila
  ├── Vê Júlia e Sebastião como opções de transfer_to_robot (sempre)
  └── Transfere conforme triagem

Júlia/Sebastião (ativos, auto_assign=false, manually_activated=true)  
  ├── Nunca pausados pelo cron
  ├── Nunca pegam conversas da fila
  └── Sempre disponíveis para receber transferências
```

