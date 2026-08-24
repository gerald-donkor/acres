DROP POLICY IF EXISTS "organization_context_insert_update" ON "Organization";

CREATE POLICY "organization_bootstrap_insert"
  ON "Organization"
  FOR INSERT
  WITH CHECK (public.acres_current_account_id() IS NOT NULL);

CREATE POLICY "organization_context_update"
  ON "Organization"
  FOR UPDATE
  USING (id = public.acres_current_organization_id())
  WITH CHECK (id = public.acres_current_organization_id());
