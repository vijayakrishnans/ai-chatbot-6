import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { comicRequestSchema, generateComic } from "@/lib/comics/generate";
import {
  getComicsByUserId,
  getImageCountThisMonth,
  saveComic,
} from "@/lib/db/queries";
import type { Comic } from "@/lib/db/schema";
import { generateUUID } from "@/lib/utils";

// The Comics tab (app/(chat)/comics): GET lists the user's comics and this
// month's image count; POST writes and draws a new one (lib/comics/generate.ts).
export const maxDuration = 60;

function fileUrl(request: Request, key: string) {
  return new URL(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/${key}`,
    request.url
  ).toString();
}

function toClient(request: Request, comic: Comic) {
  return {
    createdAt: comic.createdAt,
    id: comic.id,
    idea: comic.idea,
    panels: comic.panels.map((panel) => ({
      caption: panel.caption,
      dialogue: panel.dialogue,
      url: fileUrl(request, panel.imageKey),
    })),
    style: comic.style,
    title: comic.title,
  };
}

export type ClientComic = ReturnType<typeof toClient>;

export type ComicUsage = { used: number; limit: number | null };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [comics, used] = await Promise.all([
    getComicsByUserId({ userId: session.user.id }),
    getImageCountThisMonth({ userId: session.user.id }),
  ]);
  const usage: ComicUsage = {
    limit: entitlementsByUserType[session.user.type].maxImagesPerMonth,
    used,
  };

  return NextResponse.json({
    comics: comics.map((comic) => toClient(request, comic)),
    usage,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = comicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Describe your comic in 3 to 1000 characters" },
      { status: 400 }
    );
  }

  const limit = entitlementsByUserType[session.user.type].maxImagesPerMonth;
  if (limit !== null) {
    const used = await getImageCountThisMonth({ userId: session.user.id });
    if (used + parsed.data.panels > limit) {
      return NextResponse.json(
        {
          error: `This comic needs ${parsed.data.panels} images and you have ${Math.max(0, limit - used)} of your ${limit} left this month.`,
        },
        { status: 429 }
      );
    }
  }

  const id = generateUUID();
  try {
    const { title, panels } = await generateComic({
      comicId: id,
      request: parsed.data,
    });
    const saved = await saveComic({
      id,
      idea: parsed.data.idea,
      panels,
      style: parsed.data.style,
      title,
      userId: session.user.id,
    });
    return NextResponse.json({ comic: toClient(request, saved) });
  } catch (error) {
    console.error("Comic generation failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Could not make the comic: ${error.message.slice(0, 200)}`
            : "Could not make the comic",
      },
      { status: 502 }
    );
  }
}
