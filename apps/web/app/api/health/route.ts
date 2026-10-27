import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { DEFAULT_CHAT_MODEL, isGatewayConfigured } from "@/lib/ai/models";
import { getDb } from "@/lib/db/queries";

// Not upstream's: the deploy's smoke check and the bootstrap's probes read
// this. `/ping` proves the Worker deployed; this proves what /ping never
// touches — the HYPERDRIVE binding names a real config, Hyperdrive reaches the
// Supabase database, and db-migrate applied the schema (the template's tables
// and the key the app signs sessions with when no AUTH_SECRET is set). It
// answers without a session (proxy.ts lets it through) and reads no row.
// It also says which model provider serves — the deployment record reads it —
// as names and a yes/no, never a key.
export async function GET() {
  // Never prerendered: the answer is the database's, at request time.
  await connection();
  try {
    const db = await getDb();
    const [row] = await db.execute<{
      users: string | null;
      secrets: string | null;
    }>(
      sql`select to_regclass('public."User"')::text as users,
                 to_regclass('app_private.secrets')::text as secrets`
    );
    const ok = Boolean(row?.users && row?.secrets);
    return Response.json(
      {
        database: "reachable",
        models: {
          default: DEFAULT_CHAT_MODEL,
          gateway: isGatewayConfigured() ? "connected" : "not connected",
          provider: "workers-ai",
        },
        ok,
        schema: ok ? "migrated" : "missing",
      },
      { headers: { "cache-control": "no-store" }, status: ok ? 200 : 503 }
    );
  } catch (error) {
    console.error("health: database check failed", error);
    return Response.json(
      { database: "unreachable", ok: false },
      { headers: { "cache-control": "no-store" }, status: 503 }
    );
  }
}
