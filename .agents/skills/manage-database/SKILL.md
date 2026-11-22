---
name: manage-database
description: >-
  Design, author, audit, and validate database schemas, migrations,
  access-control/RLS policies, transactional database functions/RPCs, optimistic
  concurrency triggers, object-storage policies, and environment-split seeds
  alongside shared contracts and backend data gateways. Use when evolving or
  reviewing schemas, migrations, RLS, database functions, storage buckets, or
  seeds; not for frontend-only UI polish (use enhance-feature), runtime bug
  debugging without schema design (use fix-bugs), cross-cutting application
  security audits (use audit-security), or dependency advisories (use
  triage-dependabot).
---

# Manage Database

Evolve database schemas, access-control policies, transactional functions/RPCs, object-storage policies, and seeds declaratively while keeping shared contracts, backend data gateways, and gateway test doubles synchronized. Treat merged migrations as append-only and verify security, concurrency, and referential integrity at the database layer.

## 1. Establish mode and scope

1. Read `AGENTS.md` (when present) and inspect project manifests plus configured database tooling (migrations, schema definitions, ORM configs, or local database service configs) to locate the database stack, shared contracts, and backend gateway paths.
2. Inspect existing migrations, schema/access/function definitions, seeds, shared validation contracts, and backend data gateway adapters and tests.
3. Consult relevant database, storage, security, API, performance, architecture, and testing guides under `docs/` when present.
4. Determine the execution mode:
   - **Mode A — Database & Access-Control Audit (read-only default):** Review schemas, migrations, access/RLS policies, functions/RPCs, indexes, storage rules, or seeds without editing files and deliver prioritized, file-backed findings.
   - **Mode B — Schema, Migration, Storage & Gateway Implementation:** Author a new forward migration (or update an unmerged branch migration only when explicitly scoped), synchronize shared contracts and backend gateways, and update tests.
5. Never edit previously merged migrations; create a new forward migration following repository naming conventions.

## 2. Load stack checklists selectively

- When the repository uses Supabase, also load [Supabase migration checklist](./references/supabase-migration-checklist.md) for Supabase-specific RLS, elevated-function, query-escaping, and Storage rules.
- For other database or ORM stacks, follow the repository's configured migration tool and engineering guides in `docs/`.

## 3. Design schema, access control, and contract alignment

Before modifying schemas, migrations, or application code:

1. **Schema & constraints:** Enforce invariants at the database boundary (explicit range/enum constraints, non-null defaults, timezone-aware timestamps, exact numeric or minor-unit monetary storage, and deliberate foreign-key delete actions). Avoid destructive full-table delete-and-reinsert resets on parent tables referenced by historical records; prefer atomic upserts plus selective cleanup.
2. **Access control & privilege separation:** Ensure every table and object bucket enforces least-privilege access rules rather than relying solely on API middleware. Keep anonymous, caller-authenticated, and elevated server/service database privileges strictly separated.
3. **Atomic transactions & routines:** Keep multi-table writes, authoritative server calculations, sequence allocation, and idempotency checks inside a single transaction or stored function. Harden elevated-privilege functions (pin object resolution/search paths, restrict execution grants) and raise explicit domain errors for invalid inputs or disabled references rather than silently substituting defaults.
4. **Optimistic concurrency & indexing:** Maintain monotonic version/timestamp updates on mutable records and index filter plus keyset-cursor sort columns together.
5. **Seeds & storage:** Separate idempotent baseline configuration seeds from local-only developer credential seeds, enforce upload limits and access rules at storage boundaries, and verify reference cleanup across stored URL forms.

## 4. Implement synchronized changes (Mode B only)

1. Author the forward migration (and update baseline seeds if required).
2. Update shared contracts, schemas, and pure helpers so runtime validation matches database constraints.
3. Update backend data gateway queries, RPC/query mappings, and error mapping—plus in-memory gateway test doubles so unit and integration tests reflect real database behavior and error codes.
4. Update affected frontend consumers if response shapes or error codes changed.

## 5. Validate within repository guardrails

1. Inspect the diff to confirm schema, contract, gateway, and test parity and ensure no local-only developer credentials leak into non-local seeds or client code.
2. Format changed files using the repository's configured formatter.
3. Run configured static analysis, format-check, test, type-check, and build scripts via the project's runner.
4. When local database tooling/services are active, run the repository's configured database reset, migration, and schema lint commands.
5. **Approval gates:** Never push remote migrations, alter hosted database secrets or live environments, install dependencies, or commit/push without explicit user approval.
6. Separate **local static/unit checks** from **unverified live-database verification** honestly if local database services are unavailable.

## 6. Deliver findings and handoff

Report concisely in this order:

1. Scope audited/implemented and execution mode (Audit vs. Implementation).
2. Schema, access-control, function/RPC, concurrency, index, or seed findings/changes with exact `file:line` references.
3. Shared contract, backend gateway, and test-double parity updates (Mode B).
4. Exact commands executed and observed results.
5. Unverified live-database or hosted-environment checks and recommended follow-up.

## Skill boundaries

- Use **this skill** (`manage-database`) to design, author, or audit database schemas, migrations, access-control/RLS policies, transactional functions/RPCs, triggers, indexes, storage buckets, and seeds alongside their contract and gateway layers.
- Use `create-feature` to build full-stack user-facing features across UI, API, and contracts.
- Use `enhance-feature` to refine existing feature UI, hooks, or API validation without schema/migration design.
- Use `fix-bugs` to isolate and fix runtime defects in existing queries, API routes, or frontend code.
- Use `audit-security` for cross-cutting trust-boundary, auth/session, CSRF, rate-limiting, header, and CI security audits.
- Use `audit-performance` for production-build profiling, rendering, bundle, and end-to-end query/endpoint optimization.
- Use `verify-release` for pre-release CI parity and built-app deployment verification.
- Use `sync-docs` when documentation needs synchronization after schema or architectural changes.
