-- Tabela para armazenar histórico de relatórios antes de cada reset
CREATE TABLE public.report_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  reset_type TEXT NOT NULL DEFAULT 'manual', -- manual, scheduled
  department_id UUID REFERENCES public.departments(id),
  department_name TEXT,
  data JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array com dados de cada usuário
  totals JSONB NOT NULL DEFAULT '{}'::jsonb, -- Totais agregados
  notes TEXT
);

-- Tabela para configuração de reset agendado
CREATE TABLE public.report_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  schedule_type TEXT NOT NULL DEFAULT 'manual', -- manual, daily, weekly, monthly
  day_of_week INTEGER, -- 0-6 para weekly (0 = domingo)
  day_of_month INTEGER, -- 1-31 para monthly
  hour_of_day INTEGER NOT NULL DEFAULT 0, -- 0-23
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedule ENABLE ROW LEVEL SECURITY;

-- Policies para report_snapshots
CREATE POLICY "Admins can manage report snapshots"
ON public.report_snapshots
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view report snapshots"
ON public.report_snapshots
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Policies para report_schedule
CREATE POLICY "Admins can manage report schedule"
ON public.report_schedule
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view report schedule"
ON public.report_schedule
FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_report_schedule_updated_at
  BEFORE UPDATE ON public.report_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir configuração padrão
INSERT INTO public.report_schedule (schedule_type, hour_of_day, is_active)
VALUES ('manual', 0, false);