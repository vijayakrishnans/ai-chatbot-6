"use client";

import { GlobeIcon } from "lucide-react";
import type { WebSearchOutput } from "@/lib/ai/tools/web-search";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The sources a webSearch call returned, numbered as the answer cites them
// ([1], [2] — lib/ai/prompts.ts), the way Perplexity shows its sources.
export function WebSources({
  output,
  query,
}: {
  output?: WebSearchOutput;
  query?: string;
}) {
  if (!output) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <GlobeIcon className="size-4 animate-pulse" />
        <span>Searching the web{query ? ` for “${query}”` : ""}…</span>
      </div>
    );
  }

  if (output.results.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <GlobeIcon className="size-4" />
        <span>
          {output.error
            ? `Search failed: ${output.error}`
            : `No results for “${output.query}”`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="web-sources">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <GlobeIcon className="size-3.5" />
        <span>
          Sources for “{output.query}”
          {output.provider === "wikipedia" ? " · Wikipedia" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {output.results.map((result, index) => (
          <a
            className="group flex min-w-0 flex-col gap-1 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/60"
            href={result.url}
            key={result.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 font-medium text-[10px] text-foreground">
                {index + 1}
              </span>
              <span className="truncate">{hostOf(result.url)}</span>
            </div>
            <div className="line-clamp-2 font-medium text-[13px] leading-snug group-hover:underline">
              {result.title}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
