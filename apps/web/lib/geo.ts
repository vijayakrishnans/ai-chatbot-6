import { getCloudflareContext } from "@opennextjs/cloudflare";

// `@vercel/functions` reads the request's origin from the `x-vercel-ip-*`
// headers Vercel's edge adds (`geolocation`) and the client IP from
// `x-real-ip` (`ipAddress`). On Cloudflare the same facts arrive on the
// request's `cf` object — reachable from a Next route handler through
// getCloudflareContext() — and the `cf-connecting-ip` header. The return
// shape is `@vercel/functions`'s `Geo`, so lib/ai/prompts.ts and the chat
// route stay as written.

export type Geo = {
  city?: string;
  country?: string;
  flag?: string;
  region?: string;
  countryRegion?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
};

type CfProperties = {
  city?: string;
  country?: string;
  colo?: string;
  region?: string;
  regionCode?: string;
  latitude?: string;
  longitude?: string;
  postalCode?: string;
};

function cfProperties(request: Request): CfProperties | undefined {
  // A raw Worker request carries `cf` itself; the Request Next hands a route
  // handler does not, so fall back to the request's Cloudflare context.
  const own = (request as Request & { cf?: CfProperties }).cf;
  if (own) {
    return own;
  }
  try {
    return getCloudflareContext().cf as CfProperties | undefined;
  } catch {
    // No Cloudflare context (next dev without bindings, scripts, tests).
  }
}

// The regional-indicator emoji for an ISO 3166-1 alpha-2 country code, as
// @vercel/functions derives `flag`.
function flagFor(country: string | undefined): string | undefined {
  if (country?.length !== 2) {
    return;
  }
  const base = 0x1_f1_e6 - 65;
  return String.fromCodePoint(
    ...country
      .toUpperCase()
      .split("")
      .map((c) => base + c.charCodeAt(0))
  );
}

export function geolocation(request: Request): Geo {
  const cf = cfProperties(request);
  return {
    city: cf?.city,
    country: cf?.country,
    countryRegion: cf?.regionCode,
    flag: flagFor(cf?.country),
    latitude: cf?.latitude,
    longitude: cf?.longitude,
    postalCode: cf?.postalCode,
    region: cf?.colo,
  };
}

export function ipAddress(request: Request): string | undefined {
  const { headers } = request;
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined
  );
}
