# AP Invoice AI — Build Backlog

Sequenced tasks to build the MVP per `ap-invoice-ai-mvp-technical-prd-merged.md`.
The addendum overrides the base PRD, so its guardrails (RLS, idempotency,
compliance gating) are treated as **foundational**, not bolt-on — they appear in
Phase 0/1, not at the end.

**Legend:** `[x]` done · `[~]` authored, awaits external verification · `[ ]` to do · **AC** = acceptance criteria · deps in *(parens)*.

### Locked stack decisions (2026-05-30)

| Concern | Choice | Notes |
|---|---|---|
| Database | **Supabase Postgres** | Cloud free tier; pairs with Supabase Storage. Custom `app_user`/`app_worker` roles + `app.current_org_id` GUC created via SQL for the RLS model. |
| Object storage | **Supabase Storage** | Private bucket + signed URLs via `@supabase/supabase-js`. |
| Auth | **Clerk** | Clerk Organizations → our `organizations`/`users` synced via webhook; role from our DB. |
| Queue | **Inngest** | Managed retries/steps/DLQ; `/api/inngest` route hosts the 4 jobs. |

Task IDs are stable handles for commits/PRs (e.g. `SEC-1`). Phases map to PRD
"Build Milestones"; the addendum acceptance checklist is folded into the relevant
phase exits.

---

## Phase 0 — Project foundation (scaffolded)

Goal: a typechecking, testing, migrating skeleton with guardrails wired before
any feature code.

- [x] **F-1** Next.js 15 + TS + Tailwind app skeleton, `@/*` path alias.
- [x] **F-2** Prisma schema modeling the full PRD data model with addendum enums (`DocumentStatus`, `InvoiceReviewStatus`, `EmailMessageStatus`, `UserRole`) and idempotency indexes.
- [x] **F-3** `withOrg()` tenant-scoping helper + `prisma.ts` choke point.
- [x] **F-4** ESLint `no-restricted-imports` rule blocking raw Prisma access outside `src/lib/db`.
- [x] **F-5** RBAC permission matrix (`src/lib/auth/rbac.ts`).
- [x] **F-6** LLM gateway + single `buildExtractionPrompt()` entry point + per-model compliance gate.
- [x] **F-7** Deterministic validation rules + Vitest unit tests.
- [x] **F-8** Storage / OCR provider interfaces; background-job contracts doc.
- [x] **F-9** Manual SQL migration for RLS policies, DB roles, and the partial unique index.
- [x] **F-10** Install toolchain: Node v24.16.0, `npm install` (399 pkgs), `prisma generate`, `npm run typecheck`, `npm run lint`, `npm run test` — all green (6 tests pass).
- [x] **F-11** CI pipeline (`.github/workflows/ci.yml`): `static` job (lint + typecheck + unit/guardrail tests) and `integration` job (ephemeral `postgres:16`, `prisma db push`, RLS SQL applied, SEC-3 run as `app_user`). *Authored; verified on first CI run.*

---

## Phase 1 — Tenancy, auth & storage (PRD Milestone 1 + addendum §1)

Goal: a user can sign in, upload an invoice, and see it in the inbox — on top of
enforced multi-tenancy. **This is the security spine; do it first.**

- [x] **SEC-1** Applied to **live Supabase**: `prisma directUrl` split (app=`app_user` pooler / migrations=`postgres` direct); `npm run db:setup` ran db push → RLS/roles/grants → role passwords. App connects as `app_user` (RLS enforced). During bootstrap, found+fixed 2 more tables missing `organization_id` (`document_extractions`, `export_items`) — now all 18 tenant tables are RLS-covered.
- [x] **SEC-2** Added `organization_id` (denormalized, indexed) to `extracted_invoice_lines`, `email_attachments`, `vendor_matches`, `validation_results`; all included in the RLS loop. Every tenant-scoped table now has its own `organization_id` + `tenant_isolation` policy.
- [x] **SEC-3** Cross-tenant isolation suite (`test/integration/rls-tenant-isolation.test.ts`): **all 5 assertions pass against live Supabase** — per-org scoping, cross-id read denied, WITH-CHECK insert denied, fail-closed with no GUC. Skips without a DB; also runs in CI. — **CI gate (addendum §1.6)**
- [x] **SEC-4** ESLint-bypass test (`test/guardrails/lint-bypass.test.ts`): asserts a raw `@/lib/db/prisma` import outside `src/lib/db` errors, and the `src/lib/db` override allows it. Passes locally. — **CI gate**
- [~] **AUTH-1** Clerk wired: `src/middleware.ts` (`clerkMiddleware` protecting all but public routes) + `resolveSession()` scaffold returning `{ organizationId, userId, role, clerkOrgId, clerkUserId }`. Clerk→internal mapping is the AUTH-2 TODO. *Builds; awaits Clerk keys.*
- [ ] **AUTH-2** Add `clerk_org_id`/`clerk_user_id` columns + `/api/webhooks/clerk` to sync Clerk Orgs/users → our `organizations`/`users`; wire `user_client_access` + `effectiveRole()` into the guard; permission matrix enforced on every mutating route. *(AUTH-1, F-5)*
  - **AC:** a `clerk` is denied approve/export; a `viewer` is read-only — covered by tests.
- [x] **FILE-1** Supabase Storage adapter (`src/lib/storage/supabase.ts`) implementing `StorageProvider`; private buckets, signed-URL reads, service-role key server-side only. *Builds; awaits Supabase creds to integration-test.*
- [ ] **INTK-1** `POST /api/invoices/upload`: MIME sniffing (not header), size/page/batch caps, AV scan, content-hash dedupe, store original, create `documents` row, enqueue `process-document`; `Idempotency-Key` enforced. *(AUTH-2, FILE-1, QUE-1)* — **PRD P0**
- [ ] **INTK-2** AP Inbox page + Upload page (drag-and-drop, batch progress, status indicators). *(INTK-1)*
- [ ] **IDEM-1** `api_idempotency_keys` middleware: same key+hash → cached response; key+different hash → 409. Applied to upload/approve/reject/exports. *(AUTH-1)* — **addendum §4.6**
- **Phase 1 exit:** user uploads an invoice → it appears in the inbox with status `received`; unsupported files rejected with a clear error and **no** `documents` row created.

---

## Phase 2 — OCR & text pipeline (PRD Milestone 2)

Goal: uploaded invoices produce stored raw text + extraction metadata, asynchronously.

- [~] **QUE-1** Inngest wired: client (`src/lib/queue/inngest.ts`), typed event contracts, all 4 job functions registered (`src/jobs/*`), and the `/api/inngest` serve route. Job bodies are TODO stubs (filled in PDOC-1/EXT-1/VAL-1/EXP-2). Inngest provides retries/steps/DLQ natively (addendum §4.4). *Builds; awaits Inngest keys + per-job logic.*
- [ ] **OCR-1** Native PDF text extraction adapter; `scoreTextQuality` thresholds. *(QUE-1)*
- [ ] **OCR-2** OCR fallback adapter (Tesseract/OCRmyPDF or cloud) for scans/images + low-quality natives. *(OCR-1)*
- [ ] **PDOC-1** `process-document` job: fetch file → detect MIME → native extract → score → OCR fallback → store raw text → append `document_extractions` → compare-and-set `documents.status='text_extracted'` → enqueue `extract-invoice-data`. *(OCR-1, OCR-2)* — **idempotent per §4.5**
- [ ] **PDF-1** PDF sanitization at the upload boundary (`qpdf` strip JS/embedded/XFA). *(INTK-1)* — **addendum §2.6**
- **Phase 2 exit:** digital PDFs extract embedded text; scans/images fall back to OCR; raw text + metadata stored.

---

## Phase 3 — LLM extraction (PRD Milestone 3 + addendum §2)

Goal: raw text → schema-valid structured invoice records, with compliance + cost controls.

- [ ] **LLM-1** Model registry from env with `LlmModel` compliance flags; `provider_compliance.md` recording ZDR/BAA/SOC2/residency. *(F-6)*
- [ ] **LLM-2** Wire real OpenAI + Anthropic clients into the gateway dispatch; one correction-prompt retry on malformed JSON. *(LLM-1)* — **PRD P1**
- [ ] **LLM-3** Compliance-gate unit test: gateway throws when dispatching to a model with `allowsCustomerData:false` or `retentionDays>0`. *(LLM-1)* — **CI gate (addendum §2)**
- [ ] **LLM-4** Log scrubber (Sentry/Datadog) stripping `vendor_name|invoice_number|account_number|routing|ein|ssn|tax_id`; app logs carry IDs only. *(LLM-2)* — **CI gate; verified by synthetic invoice + log grep**
- [ ] **LLM-5** Cost/rate controls: 80k-token per-doc cap (→ `text_too_large`, `review_required`, no LLM call), per-org daily quota (→ `throttled`), provider circuit breaker → secondary model. *(LLM-2)* — **integration tests required (addendum §2.7)**
- [ ] **EXT-1** `extract-invoice-data` job: load raw text → `extractInvoice()` → append `llm_runs` (raw output, prompt version, input hash) → supersede prior pending + insert `extracted_invoices` + lines → status `llm_extracted` → enqueue validation. *(LLM-2, PDOC-1)* — **idempotent per §4.2/§4.5**
- **Phase 3 exit:** raw text converts into structured invoice records; malformed output retries then fails with a clear error.

---

## Phase 4 — Validation & review queue (PRD Milestone 4)

Goal: a user can review, correct, approve, or reject extracted invoices.

- [ ] **VAL-1** `validate-extracted-invoice` job: required/date/math checks (reuse `rules.ts`) + duplicate-invoice check (prior approved/exported, same matched vendor + invoice number) + vendor match. Replace prior `validation_results`; set `needs_review`/`pending`. *(EXT-1)*
- [ ] **VND-1** Vendor matching: normalized-name match against `vendors`, write `vendor_matches` with confidence/candidates. *(VAL-1)* — **PRD P1**
- [ ] **RVW-1** Review Queue list (`GET /api/ap/review`) + Review Detail (`GET /api/ap/review/:id`) UIs: side-by-side original preview + extracted fields, warnings, vendor suggestions, raw-text drawer, audit history. *(VAL-1, FILE-1)* — **PRD P0**
- [ ] **RVW-2** Editable fields (`PATCH`): `If-Match` optimistic concurrency → 409 on stale; every save writes `audit_events`. *(RVW-1, IDEM-1)* — **addendum §4.7**
- [ ] **RVW-3** Approve / reject (`POST .../approve|reject`): approve blocked on unresolved blocking issues; reject logs reason; retry of an upstream job on an already-approved invoice fails with a structured error. *(RVW-2)* — **addendum §4.2**
- [x] **AUD-1** `recordAudit(tx, {...})` (`src/lib/audit/log.ts`) writes `audit_events` with before/after JSON. Verified by a live-Supabase integration test exercising the real `withOrg()` under RLS. Mutations (RVW-2/3, EXP-2) call it. — **PRD NFR Auditability**
- [ ] **RVW-4** Concurrency test: two simultaneous PATCHes → one 200, one 409. *(RVW-2)* — **CI gate**
- **Phase 4 exit:** review → correct → approve/reject works end-to-end with audit trail.

---

## Phase 5 — Export & pilot readiness (PRD Milestone 5)

Goal: approved invoices export; pilot users can process real batches.

- [ ] **EXP-1** `POST /api/ap/exports`: confirm all targets approved; create `exports` row up-front; enqueue `export-invoices`. *(RVW-3)*
- [~] **EXP-2** Serializer done (`src/lib/export/serialize.ts`): `toCsv` (core fields, RFC 4180 escaping) + `toJson` (PRD normalized shape), unit-tested. Remaining: the `export-invoices` job wiring — store file, compare-and-set `exports.status`, flip invoices to `exported`, audit. *(EXP-1)* — **idempotent on `export_id`**
- [ ] **EXP-3** Export History UI (list, format, created-by/date, signed download link, invoice count). *(EXP-2)*
- [ ] **MET-1** Pilot dashboard metrics (activation / quality / workflow / business per PRD "Pilot Metrics"). *(EXP-2)*
- [ ] **RET-1** Retention/deletion jobs: null `llm_runs.output_json` at 90 days; purge orphaned storage keys; org-delete cascade completes ≤ 30 days. *(FILE-1)* — **addendum §2.5**
  - **Note (found during SEC-3):** `organization_id` FKs have no `ON DELETE CASCADE`, so `DELETE FROM organizations` is currently blocked by child rows. Addendum §2.5 expects the cascade — add `onDelete: Cascade` to the org relations (or a delete-in-order purge) as part of this task.
- **Phase 5 exit:** approved invoices export to CSV/JSON and are marked `exported`; unapproved export is blocked with an error.

---

## Phase 6 — AP inbox email ingestion (addendum §3)

Goal: promote "AP inbox ingestion" from P0 hand-wave to a real pipeline. Can run
in parallel with Phases 4–5 once Phase 2 exists.

- [ ] **MAIL-1** SES inbound infra (Terraform/CDK): receipt rule `ap+*@in.<domain>` → S3 (.eml) → SNS → SQS (`ap-inbox-incoming`) + DLQ; DKIM/SPF/DMARC `p=quarantine`; SES 40MB limit; least-privilege IAM. *(infra)*
- [ ] **MAIL-2** Address scheme + routing: parse `ap+<org>--<client>@…` → `(org, client)`; unknown → `unrouted` admin queue (never dropped). *(MAIL-1)*
- [ ] **MAIL-3** Inbox worker: fetch .eml → parse MIME → `provider_message_id = sha256(Message-ID || s3_key)` → `INSERT … ON CONFLICT DO NOTHING` → filter inline-logo/disallowed parts → file-safety (§2.6) → store + `email_attachments` + `documents (source='email')` → enqueue `process-document`; status transitions per §3.3. *(MAIL-2, INTK-1, QUE-1)*
- [ ] **MAIL-4** DLQ alerting (Slack, metadata only — no body/attachments) + idempotent replay tool. *(MAIL-3)*
- [ ] **MAIL-5** Schema deltas: `email_messages.raw_message_storage_key`, `routing_address`; `email_attachments.rejection_reason` (already in Prisma schema — confirm migration). *(F-2)*
- [ ] **MAIL-6** E2E test: test message ingests end-to-end; duplicate Message-ID → one `email_messages` row + one document set; DLQ replay verified. *(MAIL-3)* — **CI gate (addendum acceptance)**

---

## Addendum CI gate checklist (must be green before Phase 4/5 exit)

- [ ] RLS on every tenant table; cross-tenant test green *(SEC-3)*
- [ ] `withOrg` is the only data path; bypass lint test green *(SEC-4)*
- [ ] RBAC enum + `user_client_access` enforced in middleware *(AUTH-2)*
- [ ] Model registry rejects non-ZDR/BAA models; dispatch-failure test *(LLM-3)*
- [ ] Log scrubber verified by synthetic-invoice log grep *(LLM-4)*
- [ ] Per-doc token cap + per-org quota integration tests *(LLM-5)*
- [ ] SES pipeline E2E + DLQ replay *(MAIL-6)*
- [ ] Duplicate inbound email → one message row + one doc set *(MAIL-6)*
- [ ] Retry of `extract-invoice-data` on approved invoice → structured error *(RVW-3)*
- [ ] Concurrent PATCH → one 200, one 409 *(RVW-4)*
- [ ] All status columns are ENUMs; unknown status insert fails at DB *(F-2)*

---

## Suggested execution order

1. **F-10 / F-11** (unblock the toolchain + CI) — nothing builds without Node.
2. **Phase 1 security spine** (SEC-1→4, AUTH, FILE-1, INTK-1, IDEM-1) — isolation before features.
3. **Phase 2 → 3 → 4 → 5** straight down the pipeline.
4. **Phase 6 (email)** in parallel once Phase 2 lands.

## Open product questions blocking scope (PRD "Open Questions")

These need product answers and may re-order tasks:
- AP inbox in V1, or upload-only first? (decides whether Phase 6 is MVP or fast-follow)
- First export format: generic CSV / QuickBooks / Xero / JSON?
- First ICP: CPA/bookkeeping firms (multi-client) or SMB controllers? (decides whether `clients`/`user_client_access` are V1)
- First OCR provider: native-only / Tesseract / Textract / Document AI / vision LLM?
- Multi-client support in V1?
- Line items required for MVP, or header-only first?
