-- 1. Criar função SECURITY DEFINER para verificar acesso a canais sem recursão
CREATE OR REPLACE FUNCTION public.user_can_access_channel(channel_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = channel_uuid
    AND (
      cm.user_id = auth.uid() OR
      cm.department_id IN (
        SELECT pd.department_id 
        FROM profile_departments pd 
        WHERE pd.profile_id = auth.uid()
      )
    )
  );
$$;

-- 2. Remover política problemática de channel_members
DROP POLICY IF EXISTS "Users can view channel members they belong to" ON public.channel_members;

-- 3. Criar política simplificada para channel_members (sem auto-referência)
CREATE POLICY "Users can view channel members"
ON public.channel_members
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR
  user_id = auth.uid() OR
  department_id IN (
    SELECT pd.department_id 
    FROM profile_departments pd 
    WHERE pd.profile_id = auth.uid()
  )
);

-- 4. Remover política problemática de internal_channels
DROP POLICY IF EXISTS "Users can view channels they belong to" ON public.internal_channels;

-- 5. Criar política simplificada para internal_channels usando a função
CREATE POLICY "Users can view accessible channels"
ON public.internal_channels
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR
  public.user_can_access_channel(id)
);

-- 6. Remover política problemática de internal_messages
DROP POLICY IF EXISTS "Users can only view their own internal messages" ON public.internal_messages;

-- 7. Criar política corrigida para internal_messages
CREATE POLICY "Users can view their internal messages"
ON public.internal_messages
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid() OR 
  receiver_id = auth.uid() OR
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'supervisor'::app_role) OR
  (channel_id IS NOT NULL AND public.user_can_access_channel(channel_id))
);