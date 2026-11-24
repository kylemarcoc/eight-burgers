# Database and storage

Applies when the repository uses PostgreSQL / Supabase under `supabase/` alongside `packages/contracts/src/` and `apps/api/src/lib/`. Use these conventions as target engineering standards for new and hardened PostgreSQL schemas, Row-Level Security (RLS), atomic SQL RPCs, object storage policies, and database seeds declaratively under `supabase/` while keeping shared runtime schemas synchronized in `packages/contracts/src/` and backend data gateways isolated in `apps/api/src/lib/`. Verify current SQL and gateway code directly before assuming an older module already implements every standard (see [AGENTS.md](../AGENTS.md)).

## Ownership and directory layout

| Concern          | Path                                 | Responsibility                                                                                  |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Local Supabase   | `supabase/config.toml`               | Local Supabase CLI runtime settings targeting PostgreSQL 17, Auth, Storage, and seed order      |
| SQL Migrations   | `supabase/migrations/*.sql`          | Append-only, timestamped DDL migrations (`<YYYYMMDDHHMMSS>_<slug>.sql`) for tables, RLS, & RPCs |
| Seeds            | `supabase/seeds/*.sql`               | Split idempotent baseline data/config seeds vs. local-only developer auth/fixture seeds         |
| Shared contracts | `packages/contracts/src/*.schema.ts` | Shared Zod v4 schemas, domain constants, and pure helpers mirroring database constraints        |
| Backend gateway  | `apps/api/src/lib/`                  | Backend data gateway, Supabase client separation, storage path helpers, and media optimization  |

- Treat `supabase/migrations/` as immutable once merged to shared branches; introduce schema corrections via a new forward migration rather than editing applied migration files.
- Separate **idempotent baseline seeds** (using `on conflict (...) do nothing` so they can run safely against fresh staging or production databases without overwriting live edits) from **local-only development seeds** (explicitly marked `LOCAL DEVELOPMENT ONLY` and excluded from staging and production seed workflows).

## Schema design and constraints

- **Enforce invariants at the database boundary.** Use explicit `check` constraints (positive numeric bounds, bounded ranges, enum allowlists), `not null` columns with safe defaults, `timestamptz not null default now()`, and integer minor units for monetary amounts rather than floating-point numbers.
- **Choose foreign-key actions deliberately.** Use `on delete cascade` for dependent child rows (such as line items owned by a parent record) and `on delete set null` or `on delete restrict` for historical references to mutable reference records.
- **Avoid destructive `DELETE + INSERT` resets when foreign keys reference the table.** Deleting every row in a referenced table triggers `on delete set null` on historical records or violates `restrict` constraints. Implement baseline resets as atomic SQL `UPSERT` (`insert ... on conflict (id) do update`) paired with selective removal of non-baseline IDs inside a single transaction.
- **Maintain monotonic `updated_at` and integer `version` columns.** Use an illustrative `before update` trigger function (`language plpgsql set search_path = ''`) that bumps `new.updated_at := now()` and `new.version := old.version + 1` on mutable tables so privileged updates enforce atomic optimistic concurrency (`WHERE id = $id AND version = $expected_version` -> `409 Conflict`).

```sql
create or replace function public.touch_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;
```

## Row-Level Security (RLS) and client separation

- **Enable RLS on every table and bucket.** Run `alter table public.<table> enable row level security;` on all `public` tables and define explicit `storage.objects` policies rather than relying solely on API middleware checks.
- **Separate Supabase client privileges in `apps/api/src/`.** Instantiate clients with `persistSession: false`, `autoRefreshToken: false`, and `detectSessionInUrl: false` per privilege tier:
  - **Anon client (`SUPABASE_PUBLISHABLE_KEY` / legacy `SUPABASE_ANON_KEY`):** Public read queries governed by `to anon, authenticated` `SELECT` policies.
  - **User-scoped RLS client (`SUPABASE_PUBLISHABLE_KEY` + `Authorization: Bearer <accessToken>`):** Authenticated privileged table and storage mutations governed by `to authenticated` policies using a server-managed role/allowlist table and a `security definer` role helper.
  - **Service-role client (`SUPABASE_SECRET_KEY` / legacy `SUPABASE_SERVICE_ROLE_KEY`):** Restricted strictly to readiness probes, server-side allowlist lookups, and least-privilege `SECURITY DEFINER` RPCs—never used as a blanket bypass for standard user/admin CRUD routes.
- **Never query private tables anonymously.** Keep sensitive transaction, receipt, customer, and allowlist tables inaccessible to `anon` (zero `anon` policies) and mediate guest capability lookups through dedicated hashed-token RPCs.

## Atomic RPCs (`SECURITY DEFINER`) and idempotency

- **Use transactional PL/pgSQL RPCs for multi-table writes and authoritative calculations.** Operations that must compute authoritative values server-side, verify resource availability, allocate gapless or monotonic sequences (`nextval`), and insert parent/child rows atomically belong in a single database function rather than multi-request REST chains.
- **Harden every `SECURITY DEFINER` function:**
  - Pin `set search_path = ''` on the function header and schema-qualify all object references (`public.<table>`, `public.<sequence>`, `public.<function>`).
  - Lock down execution grants explicitly:
    ```sql
    revoke all on function public.create_record(...) from public, anon, authenticated;
    grant execute on function public.create_record(...) to service_role;
    ```
- **Enforce idempotency before mutating state:**
  - Store a unique `idempotency_key` and canonical `payload_hash` on the target table.
  - Check for an existing row first; reject mismatched `payload_hash` values with a deterministic conflict error, or replay the stored record when the hash matches.
  - Catch `unique_violation` around `INSERT` to handle concurrent duplicate submissions safely, and mint sequence values (`nextval`) last so rejected requests do not burn sequence numbers.
- **Validate all invariants explicitly inside RPCs.** Raise explicit domain errors (using `errcode = 'P0001'` mapped cleanly in the BFF) rather than silently dropping unknown/disallowed child IDs or silently falling back to a default or fallback record when a requested reference is disabled or invalid.

## Indexing and query performance

- **Match composite indexes to keyset pagination and filter predicates.** Add composite descending indexes covering filter columns plus the tie-breaker key, such as `(created_at desc, id desc)` and `(status, created_at desc, id desc)`, matching the query's `ORDER BY` and composite cursor comparison.
- **Avoid multi-query count amplification on polled endpoints.** Consolidate per-stage counts into a single SQL RPC (`COUNT(*) FILTER (WHERE ...)` or grouped summary) instead of issuing `N` separate `count: 'exact'` PostgREST head queries on every list refresh.
- **Escape dynamic search filters.** When building PostgREST `.or()` / `.ilike` search expressions in the BFF, strip or escape PostgREST filter delimiters (`,`, `(`, `)`, `*`, `\`, `"`) as well as SQL `LIKE` wildcards (`%`, `_`).
- **Handle unique-constraint races cleanly.** Even when slugifying human-readable IDs before `INSERT`, catch PostgreSQL `23505` (`unique_violation`) in the gateway or allocate unique slugs atomically in SQL so concurrent creates cannot fail with raw `500` errors.

## Storage buckets and media lifecycle

- **Provision buckets declaratively in migrations.** Insert or upsert into `storage.buckets` (`on conflict (id) do update`) with explicit `public`, `file_size_limit`, and `allowed_mime_types` restrictions, plus explicit `storage.objects` `SELECT`, `INSERT`, `UPDATE`, and `DELETE` RLS policies scoped to `bucket_id` and the active-role check. Public asset buckets serve non-sensitive media under public-read policies; private or user-sensitive buckets keep `public = false` and serve downloads exclusively via short-lived signed URLs after server authorization (see [Security](security.md#api-communication-private-storage-and-browser-storage)).
- **Normalize and bound uploads server-side in `apps/api/src/`.** Enforce byte-size limits before decoding, validate decoded image metadata and re-encode to WebP with Sharp (`limitInputPixels`, an explicit format allowlist, EXIF stripping/auto-rotate with `.rotate()`, and `withoutEnlargement: true`), and upload to immutable UUID object paths (`<prefix>/<uuid>.webp`) with long-lived cache headers (`cacheControl: '31536000'`, `upsert: false`) for immutable public assets.
- **Keep object cleanup consistent across URL forms.** Before deleting an object from a public bucket, check the owning table for references matching both relative proxy paths (`/storage/v1/object/public/<bucket>/...`) and absolute Supabase URLs (`${SUPABASE_URL}/storage/v1/object/public/<bucket>/...`) so locally uploaded relative URLs and cloud-hosted absolute URLs never become un-deletable or prematurely orphaned.

## Verification

- Run `npm run db:reset` and `npm run db:lint` against the local Supabase Docker stack after modifying `supabase/migrations/` or `supabase/seeds/`.
- Run `npm run lint`, `npm run format:check`, `npm run test`, `npm run typecheck`, and `npm run build` across the monorepo so shared contracts, BFF gateway adapters and test doubles, and UI consumers stay aligned. See [Testing strategy](testing-strategy.md) and [Security](security.md).
