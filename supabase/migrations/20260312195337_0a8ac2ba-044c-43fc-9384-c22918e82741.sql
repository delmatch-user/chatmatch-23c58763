CREATE OR REPLACE FUNCTION public.find_contact_by_phone(phone_input text)
 RETURNS TABLE(id uuid, name text, name_edited boolean, phone text, notes text, channel text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT c.id, c.name, c.name_edited, c.phone, c.notes, c.channel
  FROM contacts c
  WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') = ANY(normalize_phone_variants(phone_input))
  ORDER BY
    -- Priorizar match exato (dígitos limpos iguais ao input limpo)
    CASE WHEN regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(phone_input, '[^0-9]', '', 'g') THEN 0 ELSE 1 END,
    -- Depois priorizar contatos com phone preenchido (não nulo)
    CASE WHEN c.phone IS NOT NULL AND c.phone <> '' THEN 0 ELSE 1 END,
    -- Desempate estável por created_at (contato mais antigo = original)
    c.created_at ASC
  LIMIT 1;
$$;