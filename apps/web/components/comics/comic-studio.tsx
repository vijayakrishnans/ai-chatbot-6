"use client";

import { BookOpenIcon, PanelLeftIcon, SparklesIcon } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useState,
} from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type { ClientComic, ComicUsage } from "@/app/(chat)/api/comics/route";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { COMIC_STYLES, type ComicStyle } from "@/lib/comics/styles";
import { cn } from "@/lib/utils";

const api = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/comics`;

type ComicsResponse = { comics: ClientComic[]; usage: ComicUsage };

async function fetchComics(url: string): Promise<ComicsResponse> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Could not load your comics");
  }
  return res.json();
}

const PANEL_COUNTS = [4, 6] as const;
type PanelCount = (typeof PANEL_COUNTS)[number];

function Choice<T extends string | number>({
  value,
  selected,
  disabled,
  onSelect,
  children,
}: {
  value: T;
  selected: boolean;
  disabled: boolean;
  onSelect: (value: T) => void;
  children: React.ReactNode;
}) {
  const handleClick = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <button
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      {children}
    </button>
  );
}

function UsageLine({ usage }: { usage?: ComicUsage }) {
  if (!usage) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-xs">
      {usage.limit === null
        ? `${usage.used} image${usage.used === 1 ? "" : "s"} made this month · free`
        : `${usage.used} of ${usage.limit} images used this month`}
    </p>
  );
}

function ComicPanelView({
  panel,
  index,
}: {
  panel: ClientComic["panels"][number];
  index: number;
}) {
  return (
    <figure className="relative overflow-hidden rounded-md border-2 border-foreground bg-muted">
      {/* biome-ignore lint/performance/noImgElement: panels are served from R2 by this app, not optimised by next/image */}
      <img
        alt={panel.caption || `Panel ${index + 1}`}
        className="aspect-square w-full object-cover"
        loading="lazy"
        src={panel.url}
      />
      {panel.caption ? (
        <figcaption className="absolute top-0 left-0 max-w-[85%] border-foreground border-r-2 border-b-2 bg-amber-100 px-2 py-1 font-medium text-[11px] text-black uppercase leading-tight tracking-wide">
          {panel.caption}
        </figcaption>
      ) : null}
      {panel.dialogue ? (
        <div className="absolute right-2 bottom-2 left-2 rounded-2xl border-2 border-black bg-white px-3 py-1.5 text-center font-semibold text-[12px] text-black leading-snug shadow-sm">
          {panel.dialogue}
        </div>
      ) : null}
    </figure>
  );
}

function ComicView({ comic }: { comic: ClientComic }) {
  return (
    <article className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-lg uppercase tracking-tight">
          {comic.title}
        </h2>
        <span className="shrink-0 text-muted-foreground text-xs">
          {COMIC_STYLES[comic.style as ComicStyle]?.label ?? comic.style}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {comic.panels.map((panel, index) => (
          <ComicPanelView index={index} key={panel.url} panel={panel} />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{comic.idea}</p>
    </article>
  );
}

export function ComicStudio() {
  const { toggleSidebar } = useSidebar();
  const { data, mutate, isLoading } = useSWR<ComicsResponse>(api, fetchComics);
  const [idea, setIdea] = useState("");
  const [style, setStyle] = useState<ComicStyle>("superhero");
  const [panels, setPanels] = useState<PanelCount>(4);
  const [isMaking, setIsMaking] = useState(false);

  const make = useCallback(async () => {
    if (idea.trim().length < 3 || isMaking) {
      return;
    }
    setIsMaking(true);
    try {
      const res = await fetch(api, {
        body: JSON.stringify({ idea, panels, style }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not make the comic");
      }
      setIdea("");
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not make the comic"
      );
    } finally {
      setIsMaking(false);
    }
  }, [idea, isMaking, mutate, panels, style]);

  const handleIdeaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setIdea(event.target.value),
    []
  );

  const handleIdeaKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        make();
      }
    },
    [make]
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/90 px-3 backdrop-blur">
        <Button
          className="md:hidden"
          onClick={toggleSidebar}
          size="icon-sm"
          variant="ghost"
        >
          <PanelLeftIcon className="size-4" />
        </Button>
        <BookOpenIcon className="size-4 text-muted-foreground" />
        <h1 className="font-semibold text-sm">Comics</h1>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-16">
        <section className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-[var(--shadow-card)]">
          <Textarea
            disabled={isMaking}
            maxLength={1000}
            onChange={handleIdeaChange}
            onKeyDown={handleIdeaKeyDown}
            placeholder="A cat who becomes mayor of a small fishing town…"
            value={idea}
          />
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(COMIC_STYLES) as ComicStyle[]).map((key) => (
              <Choice
                disabled={isMaking}
                key={key}
                onSelect={setStyle}
                selected={style === key}
                value={key}
              >
                {COMIC_STYLES[key].label}
              </Choice>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {PANEL_COUNTS.map((count) => (
              <Choice
                disabled={isMaking}
                key={count}
                onSelect={setPanels}
                selected={panels === count}
                value={count}
              >
                {count} panels
              </Choice>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <UsageLine usage={data?.usage} />
            <Button
              disabled={isMaking || idea.trim().length < 3}
              onClick={make}
            >
              {isMaking ? <Spinner /> : <SparklesIcon />}
              {isMaking ? "Drawing…" : "Make comic"}
            </Button>
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : null}

        {data && data.comics.length === 0 && !isMaking ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            Your comics will appear here. Describe one above to start.
          </p>
        ) : null}

        {data?.comics.map((comic) => (
          <ComicView comic={comic} key={comic.id} />
        ))}
      </div>
    </div>
  );
}
