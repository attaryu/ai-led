-- Postgres Row-Level Security for tenant isolation (QA finding BE-05: app-layer
-- TenantGuard/tenantId filtering worked, but nothing at the DB layer backstopped
-- a query that forgot to filter by tenant).
--
-- This migration itself runs as the `postgres` superuser (packages/db's
-- DATABASE_URL) -- superusers always bypass RLS, with or without FORCE, so the
-- policies below only do anything once app traffic stops connecting as
-- `postgres` and starts using the dedicated roles created here instead
-- (apps/backend/.env and apps/ai/.env DATABASE_URL, docker-compose.yml).
--
-- Two runtime roles, not one:
--   app_runtime   -- NestJS (Prisma). Subject to RLS. prisma.service.ts sets
--                    the `app.tenant_id` session var per request/transaction
--                    before every query so the policies below can match it.
--   app_ai_worker -- apps/ai (Python). Granted BYPASSRLS instead of a policy.
--                    apps/ai/db/connection.py is one shared, autocommit,
--                    module-level psycopg2 connection reused across
--                    concurrently-processed jobs (worker.py's per-indicator
--                    asyncio.Semaphore fan-out) -- a session variable on that
--                    one connection isn't safe to scope per-tenant without a
--                    connection-pool rewrite first (tracked separately). Every
--                    function in postgres_client.py/generation_client.py
--                    already requires tenant_id as an explicit argument
--                    (see that module's own docstring), so this isn't a new
--                    gap, just one not yet closed at the DB layer for this role.
--
-- User (org_users) is deliberately NOT included: login/register look a user up
-- by email before any tenant is known -- that's how the tenant gets discovered
-- in the first place -- so an RLS policy here would break login for everyone.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime_dev_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_ai_worker') THEN
    CREATE ROLE app_ai_worker LOGIN PASSWORD 'app_ai_worker_dev_pw' BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE ai_led TO app_runtime, app_ai_worker;
GRANT USAGE ON SCHEMA public TO app_runtime, app_ai_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime, app_ai_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime, app_ai_worker;

-- Tables created by future migrations (still run as `postgres`) get the same
-- grants automatically, so this doesn't need re-running per migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime, app_ai_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime, app_ai_worker;

-- One policy shape, repeated per table: FORCE means even app_runtime as the
-- *owner* would be restricted if it ever became one (it isn't here -- `postgres`
-- stays the owner -- but FORCE is what actually matters for a non-owner grantee
-- role too; ENABLE alone plus FORCE together is the documented-correct pair).
ALTER TABLE org_study_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_study_programs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org_study_programs
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_files
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE evidence_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_folders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_folders
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE document_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_registry FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON document_registry
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE accreditation_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE accreditation_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON accreditation_sets
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE infra_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE infra_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON infra_jobs
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment_sessions
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE writing_led_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_led_chunk_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON writing_led_chunk_embeddings
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE evidence_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_chunk_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_chunk_embeddings
  USING (tenant_id = current_setting('app.tenant_id', true));
