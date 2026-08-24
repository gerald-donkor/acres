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

  IF setting_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN setting_value;
END;
$$;

DROP POLICY IF EXISTS "invitation_context_access" ON "Invitation";

CREATE POLICY "invitation_organization_access"
  ON "Invitation"
  FOR ALL
  USING ("organizationId" = public.acres_current_organization_id())
  WITH CHECK ("organizationId" = public.acres_current_organization_id());

CREATE POLICY "invitation_token_accept_select"
  ON "Invitation"
  FOR SELECT
  USING (
    "tokenHash" = public.acres_current_invitation_token_hash()
    AND "acceptedAt" IS NULL
    AND "revokedAt" IS NULL
    AND "expiresAt" > now()
    AND EXISTS (
      SELECT 1
      FROM "Account" a
      WHERE a.id = public.acres_current_account_id()
        AND a.email = "Invitation".email
    )
  );
