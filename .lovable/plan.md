

# Alertas de reunião atribuída para atendentes

## Problema
Quando o supervisor/admin atribui uma reunião na agenda para um atendente, este não recebe nenhum alerta. Precisamos:
1. Alerta diário (lembrete das reuniões do dia)
2. Alerta 30 minutos antes da reunião
3. Confirmação de leitura em ambos

## Mudanças

### 1. Nova tabela `appointment_alerts` (migration)

```sql
CREATE TABLE public.appointment_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  alert_type text NOT NULL DEFAULT 'daily', -- 'daily' | '30min'
  title text NOT NULL,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_alerts ENABLE ROW LEVEL SECURITY;

-- Atendentes veem e atualizam seus alertas
CREATE POLICY "Users can view own alerts" ON public.appointment_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can update own alerts" ON public.appointment_alerts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Admins/supervisores podem inserir e gerenciar
CREATE POLICY "Admins supervisors can manage alerts" ON public.appointment_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Service role insert (para edge function de cron)
CREATE POLICY "Service can insert alerts" ON public.appointment_alerts
  FOR INSERT TO public WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_alerts;
```

### 2. Edge function `appointment-alerts-cron` (nova)

Chamada por cron a cada 15 minutos. Faz duas verificações:
- **Alerta diário**: às 8h (horário de Brasília), cria alertas para reuniões do dia que ainda não foram alertadas
- **Alerta 30min**: cria alertas para reuniões que começam nos próximos 30-45 minutos

Lógica: consulta `sdr_appointments` com `status = 'scheduled'`, verifica se já existe alerta do mesmo tipo para aquele appointment+user, insere se não existir.

### 3. Cron job (SQL insert)

```sql
SELECT cron.schedule('appointment-alerts', '*/15 * * * *', $$
  SELECT net.http_post(
    url:='https://jfbixwfioehqkussmhov.supabase.co/functions/v1/appointment-alerts-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{"time":"now"}'::jsonb
  );
$$);
```

### 4. `src/pages/sdr/SDRSchedulingPage.tsx` — Inserir alerta ao criar

Quando `formData.assignedTo` é preenchido (supervisor atribuindo), inserir imediatamente um alerta `daily` para o atendente na `appointment_alerts`.

### 5. `src/components/layout/Topbar.tsx` — Banner de alerta de reunião

Adicionar hook que:
- Escuta `appointment_alerts` via realtime para o `user_id` logado
- Busca alertas não lidos ao montar
- Mostra um banner/dialog com os alertas pendentes (título, horário, tipo)
- Botão "Entendi" marca `is_read = true` e `read_at = now()`
- Também dispara notificação nativa via `sendNativeNotification`

### 6. `src/pages/Notifications.tsx` — Mostrar alertas de reunião

Adicionar seção ou mesclar alertas de reunião na lista de notificações existente, diferenciando pelo ícone (Calendar vs Bell).

## Fluxo

```text
Supervisor cria reunião atribuída a Yasmin
  → Insere em sdr_appointments (user_id = Yasmin)
  → Insere alerta imediato em appointment_alerts (type='assigned')
  
Cron a cada 15min:
  → 8h: cria alertas 'daily' para reuniões do dia
  → 30min antes: cria alertas '30min'
  
Yasmin abre o sistema:
  → Topbar mostra banner com alertas pendentes
  → Clica "Entendi" → marca como lido
  → Notificação nativa enviada (background/PWA)
```

