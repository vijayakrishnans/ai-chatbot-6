# apps/web — the app

A chatbot from Vercel's [Next.js AI Chatbot](https://github.com/vercel/ai-chatbot)
(Apache-2.0, see `LICENSE`), running on Cloudflare Workers + Static Assets:

- Streaming chat on the [AI SDK](https://ai-sdk.dev) (`app/(chat)/api/chat`),
  with the template's tools — the weather, and artifacts (text, code,
  spreadsheets) the model creates, edits and suggests changes to
- Models on Workers AI through the Worker's `AI` binding by default
  (`lib/ai/models.ts`, `lib/ai/providers.ts`); the Vercel AI Gateway's models
  are offered only when `AI_GATEWAY_API_KEY` is set
- Auth.js (next-auth v5) with credentials and a guest flow: every page signs a
  visitor without a session in as a guest (`proxy.ts`, `app/(auth)`)
- Chat history, votes, documents and suggestions in Postgres through Drizzle
- Image attachments in the `BLOB` R2 bucket, served back at
  `/api/files/<key>`
- `/ping`, answered by the proxy, and `/api/health`, which answers 200 only
  when the database is reachable through Hyperdrive and migrated

The product's name is `lib/site.ts`. The database client is built per call
over the `HYPERDRIVE` binding (`lib/db/queries.ts`); the session key is
`AUTH_SECRET` or the one the database generated (`lib/auth-secret.ts`).
Redis (`REDIS_URL`) is optional: without it there are no resumable streams
and no IP rate limit.

```bash
pnpm dev          # next dev on http://localhost:3000 (Workers AI is remote: `wrangler login` first)
pnpm build        # next build + opennextjs-cloudflare build → .open-next/
pnpm preview      # wrangler dev over the built Worker
pnpm db:migrate   # drizzle-kit, against POSTGRES_URL
```

How it runs locally, how it deploys — per environment, after the Supabase
project, the Hyperdrive config, the R2 bucket and the migrations, on merge to
`main` — and how to add the AI Gateway's models are the repository's README
and `component.yaml` beside this file.
