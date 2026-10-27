import { beforeEach, describe, expect, it, vi } from "vitest";

// The attachment routes with a mocked session and a mocked R2 binding:
// upload (app/(chat)/api/files/upload/route.ts) keeps upstream's auth and
// validation 4xx paths and answers in Vercel Blob's shape; serve
// (app/(chat)/api/files/[...key]/route.ts) streams what the bucket holds.

const auth = vi.fn();
vi.mock("@/app/(auth)/auth", () => ({ auth: (...args: unknown[]) => auth(...args) }));

const bucket = new Map<string, { body: ArrayBuffer; contentType?: string }>();
const put = vi.fn(async (key: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => {
  bucket.set(key, { body, contentType: options?.httpMetadata?.contentType });
  return { key };
});
const get = vi.fn(async (key: string) => {
  const object = bucket.get(key);
  if (!object) {
    return null;
  }
  return {
    body: new Blob([object.body]).stream(),
    httpEtag: `"etag-${key}"`,
    size: object.body.byteLength,
    writeHttpMetadata(headers: Headers) {
      if (object.contentType) {
        headers.set("content-type", object.contentType);
      }
    },
  };
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { BLOB: { get, put } } }),
}));

function upload(file: Blob | null, name = "photo.png") {
  const formData = new FormData();
  if (file) {
    formData.append("file", file, name);
  }
  return new Request("https://app.example.com/api/files/upload", { body: formData, method: "POST" });
}

describe("POST /api/files/upload", () => {
  beforeEach(() => {
    auth.mockReset();
    put.mockClear();
    bucket.clear();
  });

  it("answers 401 without a session", async () => {
    auth.mockResolvedValue(null);
    const { POST } = await import("@/app/(chat)/api/files/upload/route");
    const res = await POST(upload(new Blob(["x"], { type: "image/png" })));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(put).not.toHaveBeenCalled();
  });

  it("answers 400 when no file is attached", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/(chat)/api/files/upload/route");
    const res = await POST(upload(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file uploaded" });
  });

  it("answers 400 for a type other than JPEG/PNG and for a file over 5MB", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/(chat)/api/files/upload/route");

    const pdf = await POST(upload(new Blob(["%PDF"], { type: "application/pdf" }), "doc.pdf"));
    expect(pdf.status).toBe(400);
    expect((await pdf.json()).error).toContain("JPEG or PNG");

    const big = await POST(upload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" })));
    expect(big.status).toBe(400);
    expect((await big.json()).error).toContain("less than 5MB");
    expect(put).not.toHaveBeenCalled();
  });

  it("puts a valid image into the BLOB bucket and answers in Vercel Blob's shape", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("@/app/(chat)/api/files/upload/route");
    const res = await POST(upload(new Blob(["png-bytes"], { type: "image/png" }), "my photo (1).png"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(put).toHaveBeenCalledTimes(1);
    const [key, , options] = put.mock.calls[0]!;
    expect(key).toMatch(/^[0-9a-f-]{36}\/my_photo__1_.png$/);
    expect(options).toEqual({ httpMetadata: { contentType: "image/png" } });

    expect(body.pathname).toBe(key);
    expect(body.contentType).toBe("image/png");
    expect(body.url).toBe(`https://app.example.com/api/files/${key}`);
    expect(body.downloadUrl).toBe(`${body.url}?download=1`);
  });
});

describe("GET /api/files/[...key]", () => {
  beforeEach(() => {
    bucket.clear();
  });

  it("answers 404 for a key the bucket does not hold or a traversal attempt", async () => {
    const { GET } = await import("@/app/(chat)/api/files/[...key]/route");
    const missing = await GET(new Request("https://app.example.com/api/files/nope/x.png"), {
      params: Promise.resolve({ key: ["nope", "x.png"] }),
    });
    expect(missing.status).toBe(404);
    const traversal = await GET(new Request("https://app.example.com/api/files/..%2Fx"), {
      params: Promise.resolve({ key: ["..", "x"] }),
    });
    expect(traversal.status).toBe(404);
  });

  it("streams the object with its content type, an etag and an immutable cache header", async () => {
    bucket.set("abc/photo.png", { body: new TextEncoder().encode("png-bytes").buffer, contentType: "image/png" });
    const { GET } = await import("@/app/(chat)/api/files/[...key]/route");
    const res = await GET(new Request("https://app.example.com/api/files/abc/photo.png"), {
      params: Promise.resolve({ key: ["abc", "photo.png"] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe('"etag-abc/photo.png"');
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.text()).toBe("png-bytes");
  });

  it("sends the object as a download when asked, as Blob's downloadUrl did", async () => {
    bucket.set("abc/photo.png", { body: new ArrayBuffer(1), contentType: "image/png" });
    const { GET } = await import("@/app/(chat)/api/files/[...key]/route");
    const res = await GET(new Request("https://app.example.com/api/files/abc/photo.png?download=1"), {
      params: Promise.resolve({ key: ["abc", "photo.png"] }),
    });
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="photo.png"');
  });
});
