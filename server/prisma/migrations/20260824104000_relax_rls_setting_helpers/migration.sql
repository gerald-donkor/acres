CREATE OR REPLACE FUNCTION public.acres_current_uuid(setting_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  setting_value text;
BEGIN
  setting_value := current_setting(setting_name, true);
  IF setting_value IS NULL OR setting_value = '' THEN
    RETURN NULL;
  END IF;

  RETURN setting_value;
END;
$$;
