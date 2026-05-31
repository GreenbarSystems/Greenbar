# AP Invoice AI

AI-powered accounts-payable invoice intake & extraction. Ingests vendor invoices
(email or upload), extracts structured data with OCR + an LLM, validates with
deterministic rules, and routes to a human review queue before CSV/JSON export.

Built to the spec in `ap-invoice-ai-mvp-technical-prd-merged.md` (PRD + addendum;
the addendum wins on conflict).

## Stack

- **Next.js 15** (App Router) + React 19 + Tailwind
- **Supabase Postgres** + **Prisma**, with **Row-Level Security** for tenant isolation
- **Supabase Storage** (private buckets + signed URLs)
- **Clerk** for auth (Organizations → our org/user model)
- **Inngest** for the background job pipeline
- LLM behind a compliance-gated gateway (zero-retention models only)

## Getting started

> Requires Node ≥ 20.

1. **Create the cloud projects:** a Supabase project (Postgres + Storage), a Clerk
   application (enable Organizations), and an Inngest app. Copy their keys.
2. **Configure env:**
   ```bash
   npm install
   cp .env.example .env        # fill in Supabase/Clerk/Inngest keys + DATABASE_URL
   ```
3. **Create the RLS roles + schema** (Supabase ships only a `postgres` superuser,
   so the custom `app_user`/`app_worker` roles are created by the manual migration):
   ```bash
   npm run db:generate
   DATABASE_URL="$DATABASE_ADMIN_URL" npx prisma db push   # create tables as admin
   psql "$DATABASE_ADMIN_URL" -f prisma/migrations/manual/0001_rls_and_constraints.sql
   psql "$DATABASE_ADMIN_URL" -c "ALTER ROLE app_user WITH PASSWORD '...';"
   # then point DATABASE_URL at app_user for the running app
   ```
4. **Verify:**
   ```bash
   npm run test            # unit + guardrail tests (no DB)
   npm run test:integration   # SEC-3 RLS isolation (needs INTEGRATION_DATABASE_URL)
   npm run dev             # http://localhost:3000
   ```

> Buckets: create `ap-invoice-documents`, `ap-invoice-raw-text`, and
> `ap-invoice-inbound` as **private** buckets in Supabase Storage.

## Layout

```
prisma/
  schema.prisma                     # data model (PRD + addendum enums/indexes)
  migrations/manual/0001_*.sql      # RLS policies, DB roles, partial unique index
src/
  app/                              # Next.js routes + API handlers (PRD API design)
  lib/
    db/      with-org.ts            # the ONLY path to tenant data (RLS GUC per txn)
    auth/    rbac.ts                # permission matrix
    llm/     gateway.ts, prompt.ts  # compliance-gated extraction, single prompt builder
    ocr/                            # native + OCR text extraction interfaces
    storage/                        # object-storage interface
    validation/ rules.ts           # deterministic accounting checks (+ tests)
  jobs/                             # async pipeline contracts
```

## Guardrails baked in

- Direct `prisma.*` access is lint-blocked outside `src/lib/db` — use `withOrg()`.
- The LLM gateway refuses models lacking zero retention / customer-data approval.
- Prompts are assembled only via `buildExtractionPrompt()`.

See **`TASKS.md`** for the sequenced build backlog.
