ALTER TABLE public.agent_notifications ADD COLUMN IF NOT EXISTS week_start date NOT NULL DEFAULT (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo'))::date;

ALTER TABLE public.agent_notifications ADD CONSTRAINT agent_notifications_unique_weekly UNIQUE (agent_id, week_start);