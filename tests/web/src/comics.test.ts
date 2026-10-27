import { beforeEach, describe, expect, it, vi } from "vitest";

// The Comics tab: the script the model writes is checked before any image is
// drawn (lib/comics/script.ts), and POST /api/comics writes the script,
// draws one image per panel into R2 and saves the comic, under the monthly
// image allowance (lib/ai/entitlements.ts) — no limit today.

const auth = vi.fn();
vi.mock("@/app/(auth)/auth", () => ({ auth: (...args: unknown[]) => auth(...args) }));

const saveComic = vi.fn(async (comic: Record<string, unknown>) => ({ ...comic, createdAt: new Date(0) }));
const getImageCountThisMonth = vi.fn(async () => 0);
const getComicsByUserId = vi.fn(async () => []);
vi.mock("@/lib/db/queries", () => ({
  getComicsByUserId: (...a: unknown[]) => getComicsByUserId(...(a as [])),
  getImageCountThisMonth: (...a: unknown[]) => getImageCountThisMonth(...(a as [])),
  saveComic: (c: Record<string, unknown>) => saveComic(c),
}));

const script = {
  cast: "Mo, a ginger cat in a tiny blue sash",
  panels: [
    { caption: "Election day.", dialogue: "", scene: "A cat on a soapbox at the harbour" },
    { caption: "", dialogue: "Mo: Fish for all!", scene: "The cat addresses a crowd of gulls" },
    { caption: "", dialogue: "", scene: "Ballots being counted by fishermen" },
    { caption: "Mayor Mo.", dialogue: "Mo: Now, about lunch…", scene: "The cat in a mayor's chain eating a sardine" },
    { caption: "", dialogue: "", scene: "An extra panel nobody asked for" },
  ],
  title: "Mayor Mo",
};

const run = vi.fn(async (model: string) =>
  model === "@cf/black-forest-labs/flux-1-schnell"
    ? { image: btoa("jpeg-bytes") }
    : { response: `Here is your comic:\n\`\`\`json\n${JSON.stringify(script)}\n\`\`\`` }
);
const put = vi.fn(async () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { AI: { run }, BLOB: { put } } }),
}));

function post(body: unknown) {
  return new Request("https://app.example.com/api/comics", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("parseComicScript (lib/comics/script.ts)", () => {
  it("reads the JSON out of prose or a code fence and keeps only the panels asked for", async () => {
    const { parseComicScript } = await import("@/lib/comics/script");
    const parsed = parseComicScript(`Sure!\n\`\`\`json\n${JSON.stringify(script)}\n\`\`\``, 4);
    expect(parsed.title).toBe("Mayor Mo");
    expect(parsed.panels).toHaveLength(4);
  });

  it("refuses a reply that is not a script", async () => {
    const { parseComicScript } = await import("@/lib/comics/script");
    expect(() => parseComicScript("I cannot do that", 4)).toThrow(/did not write a comic script/);
    expect(() => parseComicScript('{"title":"x","panels":[]}', 4)).toThrow(/missing panels/);
  });
});

describe("POST /api/comics", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
    run.mockClear();
    put.mockClear();
    saveComic.mockClear();
  });

  it("is 401 without a session", async () => {
    auth.mockResolvedValue(null);
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat mayor", panels: 4, style: "cartoon" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown style or panel count before any model runs", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    expect((await POST(post({ idea: "a cat mayor", panels: 4, style: "oil" }))).status).toBe(400);
    expect((await POST(post({ idea: "a cat mayor", panels: 5, style: "cartoon" }))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("writes the script, draws each panel into R2 and saves the comic", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat becomes mayor", panels: 4, style: "superhero" }));
    expect(res.status).toBe(200);
    const { comic } = await res.json();

    expect(comic.title).toBe("Mayor Mo");
    expect(comic.panels).toHaveLength(4);
    expect(comic.panels[1]).toMatchObject({ caption: "", dialogue: "Mo: Fish for all!" });
    expect(comic.panels[0].url).toMatch(/^https:\/\/app\.example\.com\/api\/files\/comics\/[0-9a-f-]+\/1\.jpg$/);

    const imageCalls = run.mock.calls.filter(([model]) => model === "@cf/black-forest-labs/flux-1-schnell");
    expect(imageCalls).toHaveLength(4);
    // Every panel is told the cast, so the characters look the same, and
    // never to draw text, which the page letters itself.
    for (const [, inputs] of imageCalls as unknown as [string, { prompt: string }][]) {
      expect(inputs.prompt).toContain("ginger cat");
      expect(inputs.prompt).toContain("no speech bubbles");
    }
    expect(put).toHaveBeenCalledTimes(4);
    expect(saveComic).toHaveBeenCalledWith(expect.objectContaining({ style: "superhero", userId: "u1" }));
  });
});
