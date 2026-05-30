-- Manual migration: Row-Level Security, DB roles, and the partial unique index.
-- These cannot be expressed in schema.prisma. Run AFTER `prisma migrate deploy`
-- has created the tables. Tracked here so it is reviewable and replayable.
-- Source of truth: addendum §1.2, §1.3, §4.2.

-- ----------------------------------------------------------------------------
-- 1. Database roles (addendum §1.3)
-- ----------------------------------------------------------------------------
-- app_user / app_worker: RLS enforced. app_admin: BYPASSRLS (ops/migrations only).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user')   THEN CREATE ROLE app_user   LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_worker') THEN CREATE ROLE app_worker LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin')  THEN CREATE ROLE app_admin  LOGIN BYPASSRLS; END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 2. Tenant isolation policy, applied to every org-scoped table (addendum §1.2)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'users','clients','email_messages','email_attachments','documents',
    'document_extractions','llm_runs','extracted_invoices','extracted_invoice_lines',
    'vendors','vendor_matches','validation_results','exports','export_items',
    'audit_events','api_idempotency_keys'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING      (organization_id = current_setting('app.current_org_id')::uuid)
        WITH CHECK (organization_id = current_setting('app.current_org_id')::uuid);
    $p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user, app_worker;', t);
  END LOOP;
END$$;

-- SEC-2 closed: extracted_invoice_lines, email_attachments, vendor_matches, and
-- validation_results now carry a denormalized organization_id (set from their
-- parent on insert), so they are included in the loop above and fully RLS-covered.
-- Every tenant-scoped table now has its own organization_id + tenant_isolation policy.

-- ----------------------------------------------------------------------------
-- 3. One active extraction per document (addendum §4.2)
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_extracted_invoices_active
  ON extracted_invoices(document_id)
  WHERE review_status IN ('pending', 'needs_review');
