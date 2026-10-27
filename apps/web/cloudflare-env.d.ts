// The bindings wrangler.template.jsonc gives the Worker, as seen through
// `getCloudflareContext().env` from @opennextjs/cloudflare (which types `env`
// as the global `CloudflareEnv` interface for the app to augment). Typed by
// hand as the slice of the Hyperdrive, R2 and Workers AI APIs this app
// touches, rather
// than through @cloudflare/workers-types: its own `Headers`/`ReadableStream`
// declarations clash with the DOM lib a Next app compiles against.
// (`wrangler types --env-interface CloudflareEnv` generates the full
// interface from the rendered wrangler.jsonc when the runtime types are
// wanted.)

type R2HttpMetadata = {
  cacheControl?: string;
  contentDisposition?: string;
  contentType?: string;
};

type R2ObjectBody = {
  body: ReadableStream;
  httpEtag: string;
  size: number;
  writeHttpMetadata: (headers: Headers) => void;
};

type R2BucketBinding = {
  get: (key: string) => Promise<R2ObjectBody | null>;
  put: (
    key: string,
    value:
      | ArrayBuffer
      | ArrayBufferView
      | ReadableStream
      | Blob
      | string
      | null,
    options?: { httpMetadata?: R2HttpMetadata }
  ) => Promise<unknown>;
};

// The Workers AI binding as workers-ai-provider calls it
// (lib/ai/providers.ts): `run(model, inputs, options)`, a JSON answer or,
// with `stream: true` in the inputs, a server-sent-event stream.
type AiBinding = {
  run: (
    model: string,
    inputs: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
};

declare global {
  interface CloudflareEnv {
    AI: AiBinding;
    ASSETS: {
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => Promise<Response>;
    };
    BLOB: R2BucketBinding;
    HYPERDRIVE: { connectionString: string };
  }
}

export type {};
