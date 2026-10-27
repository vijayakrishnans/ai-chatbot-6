import { beforeEach, describe, expect, it, vi } from "vitest";

// app/api/health/route.ts, which the deploy's smoke and the bootstrap's
// probes read: 200 only when the database answers and the schema — the
// template's tables and the session key's — is there. The database client is
// mocked; `connection()` (which only marks the route request-time) too.
const execute = vi.fn();
vi.mock("@/lib/db/queries", () => ({ getDb: async () => ({ execute }) }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => undefined,
}));

async function health() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { body: await res.json(), status: res.status };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    execute.mockReset();
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("is ok when the database is reachable and migrated, and names the model provider", async () => {
    execute.mockResolvedValue([{ secrets: "app_private.secrets", users: '"User"' }]);
    const { body, status } = await health();
    expect(status).toBe(200);
    expect(body).toEqual({
      database: "reachable",
      models: { default: "@cf/moonshotai/kimi-k2.6", gateway: "not connected", provider: "workers-ai" },
      ok: true,
      schema: "migrated",
    });
  });

  it("is 503 when the schema is missing", async () => {
    execute.mockResolvedValue([{ secrets: null, users: '"User"' }]);
    const { body, status } = await health();
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, schema: "missing" });
  });

  it("is 503 when the database cannot be reached", async () => {
    execute.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { body, status } = await health();
    expect(status).toBe(503);
    expect(body).toEqual({ database: "unreachable", ok: false });
  });
});
