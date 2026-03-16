
-- Create function to check if user is franqueado with access to a city
CREATE OR REPLACE FUNCTION public.is_franqueado_for_city(_user_id uuid, _city text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.franqueado_cities fc ON fc.user_id = ur.user_id
    WHERE ur.user_id = _user_id
    AND ur.role = 'franqueado'
    AND lower(fc.city) = lower(_city)
  )
$$;

-- Allow franqueados to SELECT Machine conversations where contact's notes contain their city
CREATE POLICY "Franqueados can view machine conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'franqueado'::app_role)
    AND channel = 'machine'
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      JOIN public.franqueado_cities fc ON fc.user_id = auth.uid()
      WHERE c.id = contact_id
      AND c.notes ILIKE '%franqueado:' || fc.city || '%'
    )
  );

-- Allow franqueados to SELECT messages of conversations they can access
CREATE POLICY "Franqueados can view messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'franqueado'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.conversations conv
      JOIN public.contacts c ON c.id = conv.contact_id
      JOIN public.franqueado_cities fc ON fc.user_id = auth.uid()
      WHERE conv.id = conversation_id
      AND conv.channel = 'machine'
      AND c.notes ILIKE '%franqueado:' || fc.city || '%'
    )
  );

-- Allow franqueados to INSERT messages into conversations they can view
CREATE POLICY "Franqueados can send messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'franqueado'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.conversations conv
      JOIN public.contacts c ON c.id = conv.contact_id
      JOIN public.franqueado_cities fc ON fc.user_id = auth.uid()
      WHERE conv.id = conversation_id
      AND conv.channel = 'machine'
      AND c.notes ILIKE '%franqueado:' || fc.city || '%'
    )
  );

-- Allow franqueados to view contacts from their Machine conversations
CREATE POLICY "Franqueados can view relevant contacts"
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'franqueado'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.franqueado_cities fc
      WHERE fc.user_id = auth.uid()
      AND notes ILIKE '%franqueado:' || fc.city || '%'
    )
  );
