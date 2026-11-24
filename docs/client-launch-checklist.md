# Client Launch Checklist (`menu-kiosk`)

Use this per-client runbook when launching a new shop (e.g. coffee shop, burger shop) from `main`. Every client gets its own **Supabase project**, **domain/subdomain**, and **running instance** off the shared repository.

---

## Client Record (Keep Secrets in Password Manager Only)

- **Client / Shop Name:** `____________________`
- **Canonical Production URL (`APP_ORIGIN`):** `https://____________________`
- **Supabase Project Ref / URL:** `https://____________________.supabase.co`
- **Hosting Target / API Port:** `____________________`
- **Owner Email:** `____________________`
- **Queue Prefix (2–4 chars):** `____`

---

## 1. Pre-Launch Code & Build Check (Local / CI on `main`)

- [ ] Confirm clean `main` checkout on Node.js **`22.22.2+`** with locked dependencies (`npm ci`).
- [ ] Run full validation suite before deploying:
  ```sh
  npm run lint
  npm run format:check
  npm run test
  npm run typecheck
  npm run build
  ```
- [ ] Confirm hosting bind compatibility in [apps/api/src/index.ts](../apps/api/src/index.ts#L11-L16):
  - **VPS + Caddy/Nginx on the same host:** works as-is (`127.0.0.1`).
  - **Docker container / PaaS (Railway, Render, Fly):** ensure `apps/api` listens on `0.0.0.0` / `process.env.HOST` instead of `127.0.0.1` so the platform proxy can reach it.
- [ ] Confirm runtime dependencies (including native `sharp`) are installed on the target Linux OS/architecture before running `npm run start --workspace=@menu-kiosk/api`.

---

## 2. Supabase Provisioning (1 Project per Client)

- [ ] Create a dedicated **Supabase project** (PostgreSQL 17) for this client (never share a database across shops; avoid pausing free-tier projects for live storefronts).
- [ ] Push all migrations in [supabase/migrations](../supabase/migrations):
  ```sh
  npx supabase link --project-ref <project-ref>
  npx supabase db push
  ```
  - Verifies schema, RLS policies, SQL RPCs, and the `menu-images` Storage bucket (`public = true`, 5 MB max, `image/webp` only from [20261122000004_menu_images_storage.sql](../supabase/migrations/20261122000004_menu_images_storage.sql)).
- [ ] Confirm [supabase/seeds/dev_admin.sql](../supabase/seeds/dev_admin.sql) is **never** applied to staging or production.
- [ ] In Supabase Auth dashboard: keep public signups disabled (`enable_signup = false` matching [supabase/config.toml](../supabase/config.toml#L181)) and set **Site URL** to `https://<client-domain>`.
- [ ] Bootstrap the initial shop profile and **Owner** account using [scripts/init-shop.mjs](../scripts/init-shop.mjs) (`--seed=blank` for production; `--seed=demo` only for demos):
  ```sh
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  npm run shop:init -- \
    --non-interactive \
    --owner-email owner@clientshop.ph \
    --owner-password "<strong-unique-password>" \
    --store-name "<Store Name>" \
    --branch "<Branch Label>" \
    --queue-prefix <XX> \
    --seed=blank
  ```

---

## 3. Domain, DNS & Reverse Proxy Routing

- [ ] Choose **one canonical HTTPS domain/subdomain** (e.g. `https://order.clientshop.ph`) and configure 301/308 redirects from alternate hostnames (e.g. `www.` or apex) to the canonical host so browser `Origin` always matches `APP_ORIGIN` in [csrf.ts](../apps/api/src/middleware/csrf.ts#L6-L50).
- [ ] Configure **same-origin reverse proxy** rules under HTTPS:
  - Route `/api/*`, `/healthz`, and `/readyz` → client `apps/api` Node process **without stripping `/api`** (auth cookies in [cookies.ts](../apps/api/src/lib/cookies.ts#L8) are scoped to `Path=/api`).
  - Serve `apps/web/dist` for all other paths with SPA fallback to `/index.html` (so `/admin`, `/admin/orders`, `/admin/settings`, `/admin/team` load directly and survive refresh).
- [ ] Configure the proxy to strip untrusted client `X-Forwarded-For` / `X-Real-IP` headers and set real client IPs before enabling `TRUST_PROXY=true`.
- [ ] If serving a strict `Content-Security-Policy` header, allow `https://<project-ref>.supabase.co` in `img-src` (uploaded assets resolve to absolute Supabase Storage URLs in production via [menu-images.ts](../apps/api/src/lib/menu-images.ts#L29-L36)).

---

## 4. Production Environment Variables

### Frontend Build (`apps/web`, public build-time)

- [ ] `VITE_API_BASE_URL=/api/v1`
- [ ] `VITE_HIDE_PUBLIC_ADMIN=true` _(optional: hides top nav `"Staff Portal"` link while keeping `/admin` directly accessible)_

### Backend Runtime (`apps/api`, server-only — never prefix with `VITE_`)

- [ ] `NODE_ENV=production`
- [ ] `PORT=<unique-port>` (e.g. `8787`, `8788`, ...)
- [ ] `APP_ORIGIN=https://<client-domain>` _(exact scheme + host, no trailing slash)_
- [ ] `COOKIE_SECURE=true`
- [ ] `COOKIE_DOMAIN=` — **leave unset** for host-only cookies _(critical if hosting multiple clients on subdomains of a shared agency domain so cookies cannot leak across client subdomains)_
- [ ] `RECEIPT_SIGNING_SECRET=<random-32+-char-hex>` — generate uniquely per client (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); startup fails if `< 32` chars in `production` ([env.ts](../apps/api/src/config/env.ts#L40-L50))
- [ ] `TRUST_PROXY=true` _(only behind a trusted reverse proxy; otherwise `false`)_
- [ ] `ENABLE_DEMO_RESET=false`
- [ ] `SUPABASE_URL=https://<project-ref>.supabase.co`
- [ ] `SUPABASE_ANON_KEY=<project-anon-key>`
- [ ] `SUPABASE_SERVICE_ROLE_KEY=<project-service-role-key>`
- [ ] Save the complete non-git env block + Supabase details in your password manager.

---

## 5. Shop Onboarding Inside `/admin`

Sign in at `https://<client-domain>/admin` with the Owner account created in Step 2 and complete the built-in setup ([ShopSetupChecklist.tsx](../apps/web/src/features/store-settings/components/ShopSetupChecklist.tsx)):

### Store Settings (`/admin/settings`)

- [ ] Update **Store Profile**: store name, branch label, monogram, hero headline/subtext, address, landmark, contact phone, hours, pickup spot label, queue prefix, and preparing stage label.
- [ ] Upload **Logo** and optional **Hero Banner**; pick accent **Theme Preset** or custom hex and verify contrast.
- [ ] Set **Shop Origin Pin** (`originCoords`) to unlock distance-based delivery pricing.
- [ ] Configure **Fulfillment Modes**: Pickup, Delivery (base fee, per-km rate, max distance, free-delivery threshold), and Dine-in (with/without required table label).
- [ ] Configure **Payment Methods**: Cash, GCash, Maya, Bank Transfer (account name/number, instructions, and uploaded QR images).
- [ ] If Dine-in is enabled, generate & print **Table QR codes** from `https://<client-domain>/admin/settings` **on the live domain** ([TableQrGenerator.tsx](../apps/web/src/features/store-settings/components/TableQrGenerator.tsx#L14-L23) uses `window.location.origin`).

### Catalog & Team (`/admin` and `/admin/team`)

- [ ] Create active **Categories**, reusable **Option Groups / Choices**, and **Menu Items** with photos and pricing.
- [ ] Create dedicated **Cashier** and **Staff** accounts in `/admin/team` (do not share Owner credentials with floor staff).

---

## 6. Go-Live Smoke & Security Verification

- [ ] **Health & readiness probes:** Verify `https://<client-domain>/healthz` returns `200 {"status":"ok"}` and `/readyz` returns `200 {"status":"ready"}` ([health.ts](../apps/api/src/routes/health.ts)).
- [ ] **Routing & asset check:** Load `/` and deep routes (`/admin`, `/admin/settings`), then hard-reload; verify zero 404s, zero console errors, and uploaded images load cleanly from Supabase Storage.
- [ ] **Session & cookie flags:** Log into `/admin`, confirm cookies carry `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/api`, refresh stays logged in, and logout clears cookies.
- [ ] **End-to-end order test:**
  - Browse menu → customize options → place test order → submit payment reference (if digital payment enabled) → verify live order tracker.
  - In `/admin/orders` as Cashier: confirm payment → advance kitchen status → clean up/cancel test order so live queue starts clean.
- [ ] **Dine-in QR test (if enabled):** Scan a generated Table QR URL (`/?fulfillment=dine-in&table=1`) on a mobile phone and verify Dine-in + table pre-selection.
- [ ] **Mobile & theme check:** Verify storefront and cart drawer on mobile (`375px`) and desktop viewports in both Light and Dark themes.
- [ ] Hand off `/admin` login link + Owner/Cashier/Staff guide to the client.
