
-- Suporte members can update any quick message
CREATE POLICY "Suporte members can update quick messages"
ON public.quick_messages FOR UPDATE TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Suporte'))
WITH CHECK (user_in_department_by_name(auth.uid(), 'Suporte'));

-- Suporte members can delete any quick message
CREATE POLICY "Suporte members can delete quick messages"
ON public.quick_messages FOR DELETE TO authenticated
USING (user_in_department_by_name(auth.uid(), 'Suporte'));
