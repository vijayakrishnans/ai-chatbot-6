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

const IMAGE = "@cf/black-forest-labs/flux-1-schnell";
const answer = async (model: string) =>
  model === IMAGE
    ? { image: btoa("jpeg-bytes") }
    : { response: `Here is your comic:\n\`\`\`json\n${JSON.stringify(script)}\n\`\`\`` };
const run = vi.fn(answer);
// What FLUX's safety filter throws for a prompt it refuses.
const refusal = () => new Error("8007: Input prompt contains NSFW content.");
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

  it("forgives trailing commas, the commonest slip", async () => {
    const { parseComicScript } = await import("@/lib/comics/script");
    const parsed = parseComicScript('{"title":"T","cast":"c","panels":[{"scene":"s","caption":"","dialogue":"",},],}', 4);
    expect(parsed.panels).toHaveLength(1);
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
    run.mockReset();
    run.mockImplementation(answer);
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

  it("asks a refused panel again with less, and keeps the comic", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    // The first wording of every panel is refused; the second, without the
    // cast, is drawn.
    run.mockImplementation(async (model: string, inputs?: { prompt?: string }) => {
      if (model === IMAGE && inputs?.prompt?.includes("Characters:")) {
        throw refusal();
      }
      return answer(model);
    });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a woman who draws a hill", panels: 4, style: "manga" }));
    expect(res.status).toBe(200);
    const { comic } = await res.json();
    expect(comic.panels.every((p: { url: string | null }) => p.url)).toBe(true);
    expect(run.mock.calls.filter(([m]) => m === IMAGE)).toHaveLength(8);
    for (const [m, inputs] of run.mock.calls as unknown as [string, { prompt?: string }][]) {
      if (m === IMAGE) {
        expect(inputs.prompt).toContain("fully clothed");
      }
    }
  });

  it("shows a panel the filter never draws as text alone, and counts only drawn images", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    run.mockImplementation(async (model: string, inputs?: { prompt?: string }) => {
      if (model === IMAGE && inputs?.prompt?.includes("soapbox")) {
        throw refusal();
      }
      return answer(model);
    });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat becomes mayor", panels: 4, style: "cartoon" }));
    expect(res.status).toBe(200);
    const { comic } = await res.json();
    expect(comic.panels[0]).toEqual({ caption: "Election day.", dialogue: "", url: null });
    expect(comic.panels.slice(1).every((p: { url: string | null }) => p.url)).toBe(true);
    const saved = saveComic.mock.calls[0]![0] as { panels: { imageKey: string }[] };
    expect(saved.panels.filter((p) => p.imageKey)).toHaveLength(3);
  });

  it("fails plainly when the filter refuses every panel", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    run.mockImplementation(async (model: string) => {
      if (model === IMAGE) {
        throw refusal();
      }
      return answer(model);
    });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat becomes mayor", panels: 4, style: "cartoon" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/safety filter refused every panel/);
    expect(saveComic).not.toHaveBeenCalled();
  });

  it("does not retry an image error that is not a refusal", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    run.mockImplementation(async (model: string) => {
      if (model === IMAGE) {
        throw new Error("3040: Capacity temporarily exceeded");
      }
      return answer(model);
    });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat becomes mayor", panels: 4, style: "cartoon" }));
    expect(res.status).toBe(502);
    expect(run.mock.calls.filter(([m]) => m === IMAGE)).toHaveLength(4);
  });

  it("writes the script again when the first one does not parse", async () => {
    auth.mockResolvedValue({ user: { id: "u1", type: "regular" } });
    let scripts = 0;
    run.mockImplementation(async (model: string) => {
      if (model !== IMAGE && scripts++ === 0) {
        return { response: '{"title": "Broken", "panels": [ {"scene": ' };
      }
      return answer(model);
    });
    const { POST } = await import("@/app/(chat)/api/comics/route");
    const res = await POST(post({ idea: "a cat becomes mayor", panels: 4, style: "cartoon" }));
    expect(res.status).toBe(200);
    expect((await res.json()).comic.title).toBe("Mayor Mo");
  });
});
