import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// proxy.ts decodes the Auth.js session cookie BEFORE any route runs, so it
// needs the session key too — and with no AUTH_SECRET that key is the one in
// the database (lib/auth-secret.ts). These drive the real proxy with the
// database mocked: the health routes answer without a session and without
// the database; a visitor without a session goes to the guest sign-in; a
// cookie encrypted under the database's key is a session; one encrypted
// under another key is not.
const execute = vi.fn();
vi.mock("@/lib/db/queries", () => ({ getDb: async () => ({ execute }) }));

const STORED = "b".repeat(64);
// Over https (a deployment) Auth.js names the cookie with the `__Secure-`
// prefix; over http (the built Worker served locally) without it.
const SECURE = "__Secure-authjs.session-token";
const PLAIN = "authjs.session-token";

async function sessionCookie(secret: string, email: string, name = SECURE) {
  const value = await encode({
    salt: name,
    secret,
    token: { email, id: "00000000-0000-0000-0000-000000000001", type: "guest" },
  });
  return `${name}=${value}`;
}

async function proxy(path: string, cookie?: string, origin = "https://chat.example.com") {
  const { proxy: run } = await import("@/proxy");
  return run(
    new NextRequest(`${origin}${path}`, {
      headers: cookie ? { cookie } : {},
    })
  );
}

describe("proxy.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    execute.mockReset();
    execute.mockResolvedValue([{ value: STORED }]);
    delete process.env.AUTH_SECRET;
  });

  it("answers /ping itself, without the database", async () => {
    const res = await proxy("/ping");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pong");
    expect(execute).not.toHaveBeenCalled();
  });

  it("lets /api/health through without a session or the database", async () => {
    const res = await proxy("/api/health");
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(execute).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to the guest sign-in", async () => {
    const res = await proxy("/chat/abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://chat.example.com/api/auth/guest?redirectUrl=%2Fchat%2Fabc"
    );
  });

  it("accepts a session encrypted under the database's key", async () => {
    const res = await proxy("/", await sessionCookie(STORED, "guest-1"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reads the cookie Auth.js sets over http — the built Worker served locally — without the prefix", async () => {
    const plain = await sessionCookie(STORED, "guest-1", PLAIN);
    const res = await proxy("/", plain, "http://127.0.0.1:8787");
    expect(res.headers.get("x-middleware-next")).toBe("1");
    // …and over https only the prefixed one, as Auth.js would have set it.
    expect((await proxy("/", plain)).status).toBe(307);
  });

  it("refuses one encrypted under another key", async () => {
    const res = await proxy("/", await sessionCookie("c".repeat(64), "guest-1"));
    expect(res.status).toBe(307);
  });

  it("uses AUTH_SECRET instead, when it is set", async () => {
    process.env.AUTH_SECRET = "an-owner-set-secret-of-enough-length";
    const res = await proxy(
      "/",
      await sessionCookie("an-owner-set-secret-of-enough-length", "guest-1")
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(execute).not.toHaveBeenCalled();
  });
});
