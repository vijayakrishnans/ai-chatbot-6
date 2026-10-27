// OpenNext Cloudflare adapter config.
//
// The chatbot has no `"use cache"`, no `cacheTag`/`revalidateTag` and no
// pre-rendered data: every page is dynamic behind `auth()` and the shells
// that `cacheComponents` pre-renders are read-only build output. The
// static-assets incremental cache serves those shells straight from the
// Worker's static assets (populated by `populateCache local` in the build
// script; no R2/KV/DO to provision for the cache). The only caching hint the
// template carries beyond that is `fetch(..., { next: { revalidate } })` in
// lib/ai/models.ts (the gateway's model-capability lookups); that data-cache
// write is a no-op on a read-only cache, so those lookups go to the gateway
// each time. A port that wants them cached swaps this for
// `r2IncrementalCache` on the BLOB bucket (plus the WORKER_SELF_REFERENCE
// service binding).
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
