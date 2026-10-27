# ai-chatbot-6

Vercel's [Next.js AI Chatbot](https://github.com/vercel/ai-chatbot) — AI SDK
7 streaming chat with tools and artifacts, Auth.js with a guest flow, chat
history in Postgres through Drizzle, image attachments — on **Cloudflare
Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). Its models
run on **Workers AI** through the Worker's own binding, its Postgres is a
**Supabase** project's database reached through **Cloudflare Hyperdrive**,
and its attachments live in **R2**. Terraform provisions the data plane per
environment and Orun's `db-migrate` applies the schema, all on every merge to
`main`.

## Live deployment

<!-- 02-docs:begin -->
This product is **live**. Verified URLs, identity, which model provider serves
and the secrets it uses are recorded in
[ai/context/deployment.md](ai/context/deployment.md) (re-rendered by the
`02-docs` phase); how it deploys and how to operate it:
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The product's name | `apps/web/lib/site.ts` |
| The chat, auth, artifacts, tools, components and hooks | `apps/web/app`, `apps/web/components`, `apps/web/artifacts`, `apps/web/lib`, `apps/web/hooks` |
| The models: Workers AI by default, the AI Gateway when its key is set | `apps/web/lib/ai/models.ts`, `apps/web/lib/ai/providers.ts` |
| Postgres through Hyperdrive (`getDb()`), the schema for drizzle-kit | `apps/web/lib/db/queries.ts`, `apps/web/lib/db/schema.ts`, `apps/web/lib/db/migrations` |
| The session key (AUTH_SECRET, or the database's own) | `apps/web/lib/auth-secret.ts`, `apps/web/app/(auth)`, `apps/web/proxy.ts` |
| Attachments on R2 (upload, serve) | `apps/web/app/(chat)/api/files/upload`, `apps/web/app/(chat)/api/files/[...key]` |
| The database check the deploy smoke-tests | `apps/web/app/api/health/route.ts` |
| Workers build and deploy contract | `apps/web/next.config.ts`, `open-next.config.ts`, `wrangler.template.jsonc` → `wrangler.jsonc`, `component.yaml` |
| The schema as migrations, and their runner | `packages/db` (`@saas/db`), `infra/db-migrate` |
| The Supabase project, the Hyperdrive config, the R2 bucket (stage, prod) | `infra/terraform/supabase`, `infra/terraform/cloudflare-hyperdrive`, `infra/terraform/cloudflare-r2` |
| Tests | `tests/web`, `tests/db` (vitest) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # re-render apps/web/wrangler.jsonc from its template (it is committed)
pnpm typecheck
pnpm lint               # the template's own biome/ultracite in apps/web; eslint in the packages
pnpm test               # tests/web, tests/db
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

The build needs no database, no Cloudflare account and no model key:
nothing pre-renders against any of them.

## Running it locally

1. **Postgres.** Any local Postgres works; the wrangler config points the
   `HYPERDRIVE` binding's `localConnectionString` at
   `postgres://postgres:postgres@localhost:5432/postgres` (edit
   `wrangler.template.jsonc` and re-run `pnpm run wire:fixture` if yours
   differs). Apply the schema with drizzle-kit, which reads `POSTGRES_URL`
   from `apps/web/.env.local`:

   ```bash
   cp apps/web/.env.example apps/web/.env.local   # POSTGRES_URL; everything else is optional
   pnpm --filter @app/web db:migrate              # drizzle-kit migrate over apps/web/lib/db/migrations
   ```

   (In stage and prod the same SQL is applied by `infra/db-migrate` from
   `packages/db`; drizzle-kit is local-only.) The migrations generate the
   session key in the database, so no `AUTH_SECRET` is needed locally
   either.

2. **Models.** Workers AI has no local mode: `next dev` and `wrangler dev`
   reach it through the `AI` binding remotely, on your Cloudflare account —
   run `wrangler login` once. Nothing else is needed.

3. **Run it.**

   ```bash
   pnpm --filter @app/web dev        # http://localhost:3000 — Next's dev server with the Worker's bindings
   pnpm build
   pnpm --filter @app/web preview    # wrangler dev over the built Worker; optional secrets in apps/web/.dev.vars
   ```

   Opening `/` signs you in as a guest (a row in `User`); `/register`
   creates an account. Attachments land in the local R2 emulation and are
   served from `/api/files/<key>`.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment the order is
enforced — **the Supabase project, then the Hyperdrive config over its
database, then the migrations, then the Worker, with the R2 bucket applied
beside them** — because each reads what the one before it published: the
project's ref and password, the Hyperdrive id and bucket name the Worker
binds, the schema the app queries. `stage` deploys first and `prod` once
stage has converged on the same commit; `dev` only verifies. Every deploy is
smoke-tested over HTTP: `/ping`, and `/api/health`, which answers only when
the Worker reaches a migrated database.

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens and account id and the Supabase access token and org id
are brokered per run from the workspace's connections; the Supabase
project's credentials, the Hyperdrive id and the bucket name are published
by the Terraform applies as orun secrets. Nothing provider-shaped is stored
in the repository or in GitHub.

Each environment has its own Supabase project: two, which is what
Supabase's free plan allows per organisation.

## Models

The chat, the chat titles and the artifact tools run on **Workers AI**
through the Worker's `AI` binding — no key; usage is billed to the
Cloudflare account the Worker runs on, after Workers AI's free daily
allocation. The picker offers Kimi K2.6 (the default: tools, vision,
reasoning) and GLM 4.7 Flash (fast; also the title model); both are listed in
`apps/web/lib/ai/models.ts`.

To add upstream's **Vercel AI Gateway** models (DeepSeek, Kimi K2.5, GPT OSS,
Grok), set the gateway's key per environment:

```bash
wrangler secret put AI_GATEWAY_API_KEY --name ai-chatbot-6-web-stage
wrangler secret put AI_GATEWAY_API_KEY --name ai-chatbot-6-web-prod
```

Worker secrets survive every later deploy; the next request sees them, and
the picker lists the gateway's models from then on. Without the key they are
not offered, and a request naming one is answered by the default Workers AI
model. A model that fails says so in the chat (Workers AI's own message);
the writing-suggestions tool needs structured output, and a model that
cannot give it answers that the suggestions could not be made.

## Other optional secrets

- **`AUTH_SECRET`.** The session cookie needs no secret from you: unless you
  set an `AUTH_SECRET` Worker secret, its key is one the environment's
  database generated for itself when the migrations first ran. Setting
  `AUTH_SECRET` (`openssl rand -base64 32`) rotates it — every existing
  session ends, and guests get a new guest session.
- **`REDIS_URL`.** Turns on resumable streams and the per-IP rate limit, as
  upstream. Without it both are off; the per-user hourly message limit
  (`apps/web/lib/ai/entitlements.ts`) always applies.

```bash
wrangler secret put AUTH_SECRET --name ai-chatbot-6-web-prod
```

## Custom domain

The app answers on workers.dev from its first deploy. To serve it on your
own domain, attach the domain to the Worker in Cloudflare (Workers & Pages →
`ai-chatbot-6-web-prod` → Settings → Domains & Routes), then set `SITE_URL`
under that environment's `env:` in `intent.yaml` — the Open Graph images are
absolute links, built from it — and merge: the next deploy uses it.

The repository names the domain in one more place, `BASE_DOMAIN` in
`intent.yaml` (one line per environment), which the product was born with as
the reserved placeholder `ai-chatbot-6.example.com`. Replace it with your
domain in the same change.

## CI

| Workflow | What it runs |
|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes — the app built and dry-deployed for each environment, the three Terraform roots checked and planned, the migrations planned and their checksums verified — with nothing applied or deployed (typecheck, lint and the tests are `pnpm` scripts you run before you push, above); a merge applies, migrates and deploys stage → prod |
