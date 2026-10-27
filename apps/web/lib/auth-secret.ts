import { sql } from "drizzle-orm";

// The secret Auth.js signs and encrypts its session cookie with
// (app/(auth)/auth.ts) and that proxy.ts and the guest route decode it with.
//
// Upstream reads AUTH_SECRET, which its owner generates and sets. A deployed
// Worker built from nothing has no owner-set secret yet, and without one every
// request fails at the proxy. So the secret is the first of these that exists:
//
//   1. AUTH_SECRET — a Worker secret in a deployment, .dev.vars or .env.local
//      locally. Setting it is how an owner rotates the key: every session
//      signed under the previous one ends (guests get a new guest session).
//   2. the secret this environment's database generated for itself. Migration
//      020_app_secrets writes 64 random hex characters into
//      app_private.secrets the first time it runs, so it is never in a
//      repository, a CI log or a deploy artifact, and stage and prod each have
//      their own. `app_private` is not a schema Supabase's Data API exposes.
//
// The stored secret is read once per isolate and kept as a plain string: it
// does not change under a running Worker, and a string (unlike a pending
// query or a socket) is safe to share between requests. The proxy runs in the
// same Worker as the routes (OpenNext bundles it there), so it reaches the
// database through the same HYPERDRIVE binding — the one extra round trip is
// the first request an isolate serves.
let stored: string | undefined;

export async function authSecret(): Promise<string> {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    return configured;
  }
  if (stored) {
    return stored;
  }
  // Imported here rather than at the top so that a process with AUTH_SECRET
  // set (the tests, local scripts) never loads the database client.
  const { getDb } = await import("@/lib/db/queries");
  const db = await getDb();
  const rows = await db.execute<{ value: string }>(
    sql`select value from app_private.secrets where name = 'auth_secret'`
  );
  const value = rows[0]?.value;
  if (!value) {
    throw new Error(
      "No AUTH_SECRET is set and the database holds no auth_secret: apply the migrations (020_app_secrets) or set AUTH_SECRET"
    );
  }
  stored = value;
  return value;
}
