import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { usesSecureCookies } from "./lib/auth-cookie";
import { authSecret } from "./lib/auth-secret";
import { guestRegex } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // The deploy's smoke check and the bootstrap's probes read the database
  // check without a session (app/api/health/route.ts).
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Uploaded attachments are public by URL, as Vercel Blob's were: the model
  // provider and next/image fetch them without a session cookie (see
  // app/(chat)/api/files/[...key]/route.ts).
  if (request.method === "GET" && pathname.startsWith("/api/files/")) {
    return NextResponse.next();
  }

  // AUTH_SECRET, or the key the database generated (lib/auth-secret.ts),
  // under the cookie name Auth.js gave it (lib/auth-cookie.ts).
  const token = await getToken({
    req: request,
    secret: await authSecret(),
    secureCookie: usesSecureCookies(request),
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
