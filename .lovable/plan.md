

## Problemas Identificados

### 1. Auto-online fica brigando com status manual
Quando o atendente está **dentro do horário** e muda manualmente para offline (ex: foi ao banheiro), o monitor detecta `status === 'offline'` e reseta `autoOnlineDoneRef` (linha 115-117), forçando-o de volta para online no próximo tick. Isso cria um loop conflitante.

### 2. Guard de auto-online está quebrado
O `autoOnlineDoneRef` é resetado quando `profile?.status !== 'offline'` (linha 115), ou seja: online → manual offline → auto-online novamente. O guard não protege nada.

### 3. Escala cross-midnight não busca dia anterior
Se a escala é Sábado 22:00-02:00, no Domingo às 01:00 o código busca `day_of_week = 0` (Domingo). Mas a escala está em `day_of_week = 6` (Sábado). O atendente fica "sem escala" e é posto offline.

### 4. Auto-offline dispara mesmo com extensão ativa
Quando `remaining <= 0` e o atendente estendeu o turno, o cálculo pode oscilar dependendo de como `extensionMinutes` é somado no `endMinutes`, causando disparo prematuro.

---

## Solução

### Arquivo: `src/hooks/useWorkScheduleMonitor.tsx`

**A. Corrigir fetch para incluir dia anterior (cross-midnight)**
- Buscar escala do dia atual E do dia anterior
- Se a escala do dia anterior tem `end_time < start_time` (cross-midnight), verificar se ainda estamos dentro dela

**B. Auto-online apenas no início do turno (janela de 2 min)**
- Só disparar auto-online se estamos nos primeiros 2 minutos do turno
- Usar `autoOnlineDoneRef` sem reset por mudança de status — só resetar quando muda de dia/escala
- Remover o reset em linha 115-117 que causa o conflito

**C. Auto-offline robusto**
- Quando `remaining <= 0`, verificar se realmente saiu do horário (double-check `isWithinSchedule` ficou false)
- Usar `autoOfflineDoneRef` corretamente sem resetar dentro do horário

**D. Não interferir com mudanças manuais durante o turno**
- Adicionar flag `manualOverrideRef` que é setada quando o atendente muda status manualmente via Topbar
- O monitor respeita essa flag e não força auto-online durante o turno ativo

### Arquivo: `src/components/layout/Topbar.tsx`

**E. Sinalizar mudança manual**
- Quando `handleStatusChange` é chamado pelo usuário, emitir um evento ou setar uma flag no localStorage para que o monitor saiba que foi manual e não force auto-online

---

## Resumo das mudanças

| Arquivo | Mudança |
|---|---|
| `useWorkScheduleMonitor.tsx` | Fetch dia anterior para cross-midnight; auto-online só nos primeiros 2min; remover reset de ref que causa loop; respeitar override manual |
| `Topbar.tsx` | Marcar mudanças manuais de status para evitar conflito com auto-online |

