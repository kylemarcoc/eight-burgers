# Supabase Migration, RLS & RPC Checklist

> **Conditional stack playbook:** Load only when the repository uses Supabase. Defer repository-specific conventions to `AGENTS.md` and `docs/` when present.

## 1. Migration & schema hygiene

- **Append-only naming:** `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_case>.sql`. Never edit previously merged migrations; add a new forward migration.
- **Constraints & types:** Enforce `check` constraints on enums, positive numeric bounds, and bounded ranges; store timestamps as `timestamptz not null default now()` and monetary values as integer minor units.
- **Foreign-key safety:** Inspect `on delete` actions (`cascade`, `set null`, `restrict`). Never run bulk `DELETE` + re-`INSERT` resets on parent tables referenced by historical `on delete set null` keys; use `INSERT ... ON CONFLICT (id) DO UPDATE` + selective non-baseline cleanup inside one SQL transaction/RPC.
- **Optimistic concurrency:** Mutable entities carry `version integer not null default 1 check (version >= 1)` bumped by a `before update` trigger (`set search_path = ''`); gateway updates filter on `.eq('version', expectedVersion)` and distinguish `not_found` vs. `conflict`.

## 2. Row-Level Security (RLS) & client tiers

- Every table in `public` calls `alter table public.<table> enable row level security;`.
- Public-read tables permit `SELECT` `to anon, authenticated` and gate writes `to authenticated` via a `security definer` active-role helper.
- Private transaction, customer, and allowlist tables expose zero `anon` policies; authenticated access requires `to authenticated` policies gated by ownership or the active-role helper.
- Backend data gateways instantiate non-persisting clients strictly per privilege tier:
  - **Anon client:** Public read-only queries.
  - **User-scoped RLS client (`Authorization: Bearer <accessToken>`):** Caller-authorized table and storage mutations.
  - **Service-role client:** Strictly readiness checks, allowlist verification, and least-privilege `SECURITY DEFINER` RPCs—never blanket CRUD bypass.

## 3. `SECURITY DEFINER` RPCs & idempotency

- Set `security definer` and `set search_path = ''`, schema-qualify all references (`public.<table>`, `public.<fn>`), and restrict execution grants:
  ```sql
  revoke all on function public.<fn_name>(...) from public, anon, authenticated;
  grant execute on function public.<fn_name>(...) to service_role;
  ```
- Verify `idempotency_key` + `payload_hash` before state mutation, handle `unique_violation` races cleanly, and call `nextval(...)` after all domain validations pass so rejected requests do not burn sequences.
- Reject invalid or disabled references explicitly (`errcode = 'P0001'`) rather than silently substituting fallback records or dropping unknown options.

## 4. Indexes, PostgREST filters & Storage buckets

- Add composite descending indexes matching filter + tie-breaker cursor sort order (`(created_at desc, id desc)`, `(status, created_at desc, id desc)`).
- Consolidate multi-bucket counts into one SQL query/RPC rather than issuing `N` parallel `count: 'exact'` head calls on polled endpoints.
- Escape PostgREST `.or()` delimiters (`,`, `(`, `)`, `*`, `\`, `"`) and SQL `LIKE` wildcards (`%`, `_`); catch PostgreSQL `23505` unique collisions when creating slugified IDs concurrently.
- Provision `storage.buckets` declaratively in migrations (`file_size_limit`, `allowed_mime_types`, `public` flag) with explicit `storage.objects` RLS policies; keep sensitive buckets private (`public = false`) and serve downloads via short-lived signed URLs. For public buckets, match both relative proxy paths (`/storage/v1/object/public/...`) and absolute `${SUPABASE_URL}/storage/v1/object/public/...` URLs before object deletion.

## 5. Seeds & local verification

- Keep baseline data seeds idempotent (`on conflict (...) do nothing`) and keep local developer credential seeds clearly marked `LOCAL DEVELOPMENT ONLY` and excluded from staging/production pipelines.
- Format changed files with the repository's configured formatter, run configured local Supabase reset and schema lint scripts, and run the full repository check suite (`lint`, format-check, `test`, `typecheck`, `build`).
