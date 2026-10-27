import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = (formData.get("file") as File).name;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileBuffer = await file.arrayBuffer();

    try {
      // Vercel Blob's `put(name, body, { access: "public" })` becomes a put
      // into the R2 bucket bound as BLOB, under an unguessable key (Blob's
      // random suffix served the same purpose). The response keeps Blob's
      // shape — `url`, `pathname`, `contentType` — so the client
      // (components/chat/multimodal-input.tsx) stays as written; the URL is
      // this app's own, served by app/(chat)/api/files/[...key]/route.ts.
      const pathname = `${crypto.randomUUID()}/${safeName}`;
      const { env } = getCloudflareContext();
      await env.BLOB.put(pathname, fileBuffer, {
        httpMetadata: { contentType: file.type },
      });

      const url = new URL(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/${pathname}`,
        request.url
      ).toString();

      return NextResponse.json({
        contentDisposition: `inline; filename="${safeName}"`,
        contentType: file.type,
        downloadUrl: `${url}?download=1`,
        pathname,
        url,
      });
    } catch {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
