// Whether Auth.js's session cookie carries the `__Secure-` prefix for this
// request — which proxy.ts and the guest route must know to decode it.
//
// Auth.js decides it from the URL it serves: https gets the prefix, http does
// not (AUTH_URL when set, otherwise the request's forwarded protocol). Upstream
// decoded with `secureCookie: !isDevelopmentEnvironment` instead, which agrees
// on a deployment (https) and under `next dev` (http) but not for the BUILT
// Worker served over http — `pnpm preview`, `wrangler dev` — where the guest
// sign-in set `authjs.session-token`, the proxy looked for
// `__Secure-authjs.session-token`, and every page sent the visitor back to the
// guest sign-in. Decided the way Auth.js decides it, the two always agree.
export function usesSecureCookies(request: Request): boolean {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) {
    return new URL(configured).protocol === "https:";
  }
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  return new URL(request.url).protocol === "https:";
}
