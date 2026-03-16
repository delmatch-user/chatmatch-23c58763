
-- Table to link a robot to the SDR pipeline
CREATE TABLE public.sdr_robot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id uuid REFERENCES public.robots(id) ON DELETE CASCADE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Only one active config at a time
CREATE UNIQUE INDEX sdr_robot_config_active_unique ON public.sdr_robot_config (is_active) WHERE is_active = true;

ALTER TABLE public.sdr_robot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDR robot config manageable by comercial users"
ON public.sdr_robot_config FOR ALL
TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'))
WITH CHECK (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "SDR robot config viewable by comercial users"
ON public.sdr_robot_config FOR SELECT
TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Comercial') OR has_role(auth.uid(), 'admin'));

-- Add sdr_deal_id to conversations to link WhatsApp chats to pipeline deals
ALTER TABLE public.conversations ADD COLUMN sdr_deal_id uuid REFERENCES public.sdr_deals(id) ON DELETE SET NULL;
