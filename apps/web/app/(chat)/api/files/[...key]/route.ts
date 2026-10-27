import { getCloudflareContext } from "@opennextjs/cloudflare";

// Vercel Blob served uploads from its own public host; here the Worker
// streams them out of the R2 bucket. As with a public Blob URL the key is the
// only secret (an unguessable prefix per upload, see ../upload/route.ts):
// there is no session check, because the readers are not only the browser —
// the model provider fetches image parts by URL through the gateway and
// next/image's optimizer fetches the source server-side, and neither carries
// the session cookie. proxy.ts lets GET /api/files/* through for the same
// reason.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const objectKey = key.map((segment) => decodeURIComponent(segment)).join("/");

  if (!objectKey || objectKey.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const { env } = getCloudflareContext();
  const object = await env.BLOB.get(objectKey);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Keys are unique per upload and objects never change under a key.
  headers.set("cache-control", "public, max-age=31536000, immutable");

  if (new URL(request.url).searchParams.get("download") === "1") {
    const filename = objectKey.split("/").pop() ?? "attachment";
    headers.set("content-disposition", `attachment; filename="${filename}"`);
  }

  return new Response(object.body, { headers });
}
