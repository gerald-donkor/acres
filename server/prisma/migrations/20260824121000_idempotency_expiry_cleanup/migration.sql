CREATE POLICY idempotency_account_or_org_delete ON "IdempotencyRecord"
  FOR DELETE
  USING (
    "accountId" = current_setting('acres.account_id', true)
    AND (
      "organizationId" IS NULL
      OR "organizationId" = current_setting('acres.organization_id', true)
    )
    AND "expiresAt" <= CURRENT_TIMESTAMP
  );

GRANT DELETE ON "IdempotencyRecord" TO acres_app;
