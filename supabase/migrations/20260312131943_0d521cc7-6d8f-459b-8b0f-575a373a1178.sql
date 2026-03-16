CREATE OR REPLACE FUNCTION public.find_contact_by_phone(phone_input text)
 RETURNS TABLE(id uuid, name text, name_edited boolean, phone text, notes text, channel text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.name, c.name_edited, c.phone, c.notes, c.channel
  FROM contacts c
  WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') = ANY(normalize_phone_variants(phone_input))
  LIMIT 1;
$function$;