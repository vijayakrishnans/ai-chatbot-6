# ai-chatbot-6 — operating contract (for humans and agents)

This is the standing guide to how this product is deployed and operated.
Instance facts (live URLs, workspace, which model provider serves, the
secrets it uses) live in [deployment.md](deployment.md), rendered from
probed reality by the bootstrap's `02-docs` phase; this file is the contract
that stays true between deployments. It is written to give an agent with
repository read access enough context to reason about and operate the product
without any other source.

## What this system is

Vercel's Next.js AI Chatbot — streaming chat with tools and artifacts on the
AI SDK, Auth.js with guest and registered users, chat history, votes and
documents in Postgres, image attachments — on Cloudflare Workers. Its models
run on Workers AI through the Worker's `AI` binding, its Postgres is a
Supabase project reached through Cloudflare Hyperdrive, and its attachments
live in an R2 bucket, all expressed as an Orun component-native
desired-state repo. Eight components:

- **`infra/terraform/supabase`** (`supabase`) — one Supabase project per
  environment. Its apply publishes `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` onto the environment's secret
  rung.
- **`infra/terraform/cloudflare-hyperdrive`** (`cloudflare-hyperdrive`) — one
  Hyperdrive config per environment over that database. Its apply publishes
  `WIRING_CLOUDFLARE_HYPERDRIVE` (the config's id and name).
- **`infra/terraform/cloudflare-r2`** (`cloudflare-r2`) — one R2 bucket per
  environment for attachments. Its apply publishes `WIRING_CLOUDFLARE_R2`
  (the bucket's name).
- **`infra/db-migrate`** (`db-migrate`) — applies `packages/db`'s migrations
  to the environment's database through Supabase's Management API. Each
  migration is recorded with its checksum in `_migrations.applied`; only the
  missing ones apply.
- **`packages/db`** (`db`) — the migrations and their runner.
- **`apps/web`** (`web`) — the app: Next.js built by `@opennextjs/cloudflare`
  into one Worker plus Static Assets. It reaches Postgres through its
  `HYPERDRIVE` binding, one client per call (`lib/db/queries.ts`), stores
  attachments through its `BLOB` binding and runs models through its `AI`
  binding (`lib/ai/providers.ts`).
- **`tests/web`**, **`tests/db`** — vitest suites. Their `dev` lanes install
  and check the package's structure; the suites themselves, the type check
  and the linters are `pnpm test`, `pnpm typecheck` and `pnpm lint`, run
  before you push.

Environments: **`stage`** and **`prod`** are deployed, each with its own
Supabase project — two projects, which is what Supabase's free plan allows
per organisation. **`dev` is verify-only by design** — lanes build and test,
nothing deploys.

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. Per environment, in this order — each edge `mode: enforced` on a push to
   main, advisory on a pull request (which deploys nothing):
   **`supabase` → `cloudflare-hyperdrive` → `db-migrate` → `web`**, and
   **`cloudflare-r2` → `web`**. A job resolves its secrets when it starts, so
   each one reads what the apply before it published. The app's deploy
   re-renders `apps/web/wrangler.jsonc` from `WIRING_CLOUDFLARE_HYPERDRIVE`
   and `WIRING_CLOUDFLARE_R2` before it builds, deploys
   `ai-chatbot-6-web-<env>`, and smoke-tests it: `/ping`, and `/api/health`,
   which answers 200 only when the database is reachable through Hyperdrive
   and migrated.
4. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
5. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "product
  converged"; probe the URLs instead.
- Every page sends a visitor without a session to `/api/auth/guest`, which
  creates a guest user and signs it in. Probe `/ping` and `/api/health`,
  which answer without a session; `/` answers with a redirect.
- `apps/web/wrangler.jsonc` is committed as the render of
  `wrangler.template.jsonc` from `wiring.fixture.json` (a placeholder
  Hyperdrive id and bucket name): edit the template and run
  `pnpm run wire:fixture`. The deploy lanes render the real one in their own
  job tree; never commit a real id.
- The R2 bucket is applied with the `r2-data` token, but the Worker's
  `BLOB` binding is attached by the deploy, which runs with the
  `workers-deploy` token (Workers Scripts and KV). Whether that token may
  attach an R2 binding is not yet proven live; a deploy that fails on it is
  a platform fix, not a change to this repository.
- Every table in `public` has row-level security and no policy. Supabase's
  Data API serves `public` to the anon key, so this is what keeps the users
  (password hashes included), chats and messages out of it; the app is
  unaffected because it connects as `postgres`, the tables' owner. Give a new
  table `.enableRLS()`; never `FORCE` it, and never add a policy for `anon`
  without meaning to publish that table.
- A migration is immutable once applied: its checksum is in
  `packages/db/src/manifest.ts` and in the database's ledger. Change the
  schema with a NEW migration (in `packages/db/src/migrations`, and its
  drizzle-kit twin in `apps/web/lib/db/migrations` for local databases).

## Models

- **Workers AI is the default** for the chat, the titles and the artifact
  tools: `@cf/zai-org/glm-4.7-flash` (the default — tools, reasoning, about a
  tenth of Kimi's price, so a small app stays in the free daily allocation;
  also the title model) and `@cf/moonshotai/kimi-k2.6` (tools, vision,
  reasoning), in
  `apps/web/lib/ai/models.ts`. They run on the Cloudflare account the Worker
  deploys to, through its `AI` binding — no key, billed to that account
  (Workers AI's free daily allocation first).
- **Web search** (`apps/web/lib/ai/tools/web-search.ts`): the chat's
  `webSearch` tool, answered with numbered sources the model cites as [1],
  [2]. Tavily with `TAVILY_API_KEY` set as a Worker secret (1,000 searches a
  month free); without it, Wikipedia's search API, which needs nothing.
- **Comics** (`/comics`, `apps/web/lib/comics`): GLM 4.7 Flash writes a 4- or
  6-panel script, FLUX.1 [schnell] on Workers AI draws each panel into the
  BLOB bucket, and the `Comic` table (migration `040_comics`) keeps it. Every
  image is counted per user per month; `maxImagesPerMonth` in
  `apps/web/lib/ai/entitlements.ts` is `null` (no limit) until a free tier
  — 100 a month, say — is wanted.
- **The Vercel AI Gateway is optional.** With `AI_GATEWAY_API_KEY` set as a
  Worker secret, the picker also offers upstream's gateway models (DeepSeek,
  Kimi K2.5, GPT OSS, Grok). Without it they are not offered, and a request
  naming one is answered by the default Workers AI model instead.
- A model's failure is shown in the chat as Workers AI's own message, never
  as a 500. A tool a model cannot serve (the writing-suggestions tool needs
  structured output) answers the model with what went wrong, and the chat
  goes on.
- Redis is optional too: without `REDIS_URL` there are no resumable streams
  and no IP rate limit; the per-user hourly message limit
  (`lib/ai/entitlements.ts`) always applies.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  connections — no long-lived values at rest, nothing to rotate by hand:
  `CLOUDFLARE_API_TOKEN` (Workers deploy), `CLOUDFLARE_HYPERDRIVE_TOKEN`
  (Hyperdrive) and `CLOUDFLARE_R2_TOKEN` (R2) — the deploy token
  deliberately cannot touch either — `CLOUDFLARE_ACCOUNT_ID`,
  `SUPABASE_ACCESS_TOKEN` (project create and migrations) and
  `SUPABASE_ORG_ID`.
- **Published by the applies** onto the stage and prod rungs:
  `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `WIRING_CLOUDFLARE_HYPERDRIVE`, `WIRING_CLOUDFLARE_R2`.
- **Optional Worker secrets the owner adds**, because no platform brokers
  them: `AI_GATEWAY_API_KEY` (the gateway's models), `REDIS_URL` (resumable
  streams, the IP rate limit).
- **The session key.** `AUTH_SECRET`, when set as a Worker secret, signs and
  encrypts the session cookie. Unset, the key is the one the environment's
  database generated for itself (`app_private.secrets`, migration
  `020_app_secrets`; `apps/web/lib/auth-secret.ts`) — so a fresh deployment
  signs guests and new users in without any secret set by hand. The proxy
  reads the same key over the same Hyperdrive binding. Setting `AUTH_SECRET`
  rotates it: every existing session ends.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.

## Verifying the system

```bash
# the Worker and its database path on each environment (also recorded, probed, in deployment.md)
curl -s https://ai-chatbot-6-web-stage.vijayakrishnan12994.workers.dev/ping
curl -s https://ai-chatbot-6-web-prod.vijayakrishnan12994.workers.dev/api/health

# workspace readiness (integrations + repository link)
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| change the schema | add the table to `apps/web/lib/db/schema.ts` with `.enableRLS()`, `pnpm --filter @app/web db:generate`, copy the SQL into a new `packages/db/src/migrations/<nnn>_<name>/up.sql` and the manifest (`pnpm --filter @saas/db run manifest:fix` for its checksum), merge — db-migrate applies it before the app deploys. `pnpm test` fails on a table in `public` without row-level security |
| add or change a model | `apps/web/lib/ai/models.ts`: a Workers AI model in `workersAiModels` with its capabilities, a gateway model in `gatewayModels` |
| turn the AI Gateway on | `wrangler secret put AI_GATEWAY_API_KEY --name ai-chatbot-6-web-<env>` |
| redeploy without a change | edit the last line of the component's `component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| rotate the session key | `wrangler secret put AUTH_SECRET --name ai-chatbot-6-web-<env>` (32+ random bytes); every session ends |
| serve a custom domain | attach it to the Worker in Cloudflare (Workers & Pages → the Worker → Settings → Domains & Routes), then set `SITE_URL` under the environment's `env:` in `intent.yaml` (the Open Graph images' origin), replace the placeholder `ai-chatbot-6.example.com` in its `BASE_DOMAIN` with the domain, and merge |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

Structural changes (a second Worker, a queue, another data store) follow the
same contract that deployed the product: add a component under `apps/`,
`infra/` or `packages/` with a `component.yaml` — declaring `dependsOn` on
any infrastructure whose published secrets it reads, enforced on main — land
it as a pull request, and the convergence run applies it.
