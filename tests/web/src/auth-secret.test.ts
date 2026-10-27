import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/auth-secret.ts: the key Auth.js signs and encrypts the session cookie
// with is AUTH_SECRET when one is set, and otherwise the key the
// environment's database generated for itself (migration 020_app_secrets) —
// read once per isolate. The database client is mocked: what is tested is
// which key wins and when the database is asked.
const execute = vi.fn();
const getDb = vi.fn(async () => ({ execute }));

vi.mock("@/lib/db/queries", () => ({ getDb: () => getDb() }));

const STORED = "a".repeat(64);

describe("the session key (lib/auth-secret.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    execute.mockReset();
    getDb.mockClear();
    delete process.env.AUTH_SECRET;
  });

  it("is AUTH_SECRET when one is set, without asking the database", async () => {
    process.env.AUTH_SECRET = "an-owner-set-secret-of-enough-length";
    const { authSecret } = await import("@/lib/auth-secret");
    expect(await authSecret()).toBe("an-owner-set-secret-of-enough-length");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("is the stored key otherwise, read once per isolate", async () => {
    execute.mockResolvedValue([{ value: STORED }]);
    const { authSecret } = await import("@/lib/auth-secret");
    expect(await authSecret()).toBe(STORED);
    expect(await authSecret()).toBe(STORED);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("treats an empty AUTH_SECRET (an .env line left blank) as unset", async () => {
    process.env.AUTH_SECRET = "";
    execute.mockResolvedValue([{ value: STORED }]);
    const { authSecret } = await import("@/lib/auth-secret");
    expect(await authSecret()).toBe(STORED);
  });

  it("names the missing migration when there is neither", async () => {
    execute.mockResolvedValue([]);
    const { authSecret } = await import("@/lib/auth-secret");
    await expect(authSecret()).rejects.toThrow(/020_app_secrets/);
  });
});
