import { tool } from "ai";
import { z } from "zod";

// Web search for answers with sources, the way Perplexity answers: the model
// calls this, reads the results and cites them as [1], [2] (lib/ai/prompts.ts),
// and the chat shows the sources under the answer (components/chat/message.tsx).
//
// Two backends, both free. Tavily, with TAVILY_API_KEY set (a Worker secret):
// a search API built for this, 1,000 searches a month free with no card.
// Without the key, Wikipedia's own search API, which needs nothing — so a
// fresh deployment searches before anyone signs up for anything.

export type SearchProvider = "tavily" | "wikipedia";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchOutput = {
  provider: SearchProvider;
  query: string;
  results: SearchResult[];
  error?: string;
};

const MAX_RESULTS = 5;
const SNIPPET_CHARS = 600;

// Read at call time: OpenNext copies the Worker's secrets into process.env
// per request.
export function searchProvider(): SearchProvider {
  return process.env.TAVILY_API_KEY ? "tavily" : "wikipedia";
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS
    ? `${flat.slice(0, SNIPPET_CHARS)}…`
    : flat;
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    body: JSON.stringify({
      include_answer: false,
      max_results: MAX_RESULTS,
      query,
      search_depth: "basic",
    }),
    headers: {
      authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Tavily answered ${res.status}`);
  }
  const json = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      snippet: clip(r.content ?? ""),
      title: r.title ?? r.url ?? "",
      url: r.url ?? "",
    }));
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srlimit: String(MAX_RESULTS),
    srsearch: query,
    utf8: "1",
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    // Wikimedia asks every API client to name itself.
    headers: { "user-agent": "ai-chatbot-web-search/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Wikipedia answered ${res.status}`);
  }
  const json = (await res.json()) as {
    query?: { search?: { title: string; snippet?: string }[] };
  };
  return (json.query?.search ?? []).map((r) => ({
    snippet: clip((r.snippet ?? "").replace(/<[^>]+>/g, "")),
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
  }));
}

export async function runWebSearch(query: string): Promise<WebSearchOutput> {
  const provider = searchProvider();
  try {
    const results =
      provider === "tavily"
        ? await searchTavily(query)
        : await searchWikipedia(query);
    return { provider, query, results };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Search failed",
      provider,
      query,
      results: [],
    };
  }
}

export const webSearch = tool({
  description:
    "Search the web for current or factual information: news, recent events, prices, people, places, documentation, or anything you are not sure of. Returns numbered sources to cite.",
  execute: async ({ query }) => runWebSearch(query),
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(400)
      .describe(
        "A focused search query, as you would type it into a search engine"
      ),
  }),
});
