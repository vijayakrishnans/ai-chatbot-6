import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWebSearch, searchProvider } from "@/lib/ai/tools/web-search";

// The webSearch tool (lib/ai/tools/web-search.ts): Tavily with
// TAVILY_API_KEY, Wikipedia's search API without it, and a failed search
// answered as an empty result with the reason rather than thrown into the chat.

const fetchMock = vi.fn();

describe("webSearch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.TAVILY_API_KEY;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TAVILY_API_KEY;
  });

  it("searches Wikipedia with no key, needing nothing set up", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        query: {
          search: [{ snippet: 'The <span class="searchmatch">Eiffel</span> Tower is…', title: "Eiffel Tower" }],
        },
      })
    );
    expect(searchProvider()).toBe("wikipedia");
    const out = await runWebSearch("eiffel tower height");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("en.wikipedia.org/w/api.php");
    expect(out).toEqual({
      provider: "wikipedia",
      query: "eiffel tower height",
      results: [
        { snippet: "The Eiffel Tower is…", title: "Eiffel Tower", url: "https://en.wikipedia.org/wiki/Eiffel_Tower" },
      ],
    });
  });

  it("searches Tavily with its key, sending the key as a bearer token", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    fetchMock.mockResolvedValue(
      Response.json({ results: [{ content: "Rates held.", title: "Fed decision", url: "https://news.example/fed" }] })
    );
    const out = await runWebSearch("fed rates today");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.headers.authorization).toBe("Bearer tvly-test");
    expect(JSON.parse(init.body)).toMatchObject({ max_results: 5, query: "fed rates today" });
    expect(out.provider).toBe("tavily");
    expect(out.results).toEqual([{ snippet: "Rates held.", title: "Fed decision", url: "https://news.example/fed" }]);
  });

  it("answers a failed search with no results and the reason", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    fetchMock.mockResolvedValue(new Response("quota", { status: 432 }));
    const out = await runWebSearch("anything");
    expect(out.results).toEqual([]);
    expect(out.error).toBe("Tavily answered 432");
  });
});
