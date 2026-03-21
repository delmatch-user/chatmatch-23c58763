ALTER TABLE public.contacts ADD COLUMN city TEXT DEFAULT NULL;

-- Migrate existing city data from notes (pattern: franqueado:CityName)
UPDATE public.contacts
SET city = trim(substring(notes FROM 'franqueado:([^\n,;]+)'))
WHERE notes ILIKE '%franqueado:%' AND city IS NULL;