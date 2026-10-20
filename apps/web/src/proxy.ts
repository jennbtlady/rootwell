import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request. Refreshes the Supabase session cookie and does
 * the cheap, optimistic sign-in check. Role and MFA checks need the database and
 * live in the /app layout instead, as the Next.js docs advise.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the token locally and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  const redirectWithCookies = (to: string) => {
    const target = request.nextUrl.clone();
    target.pathname = to;
    target.search = "";
    if (to === "/sign-in" && path !== "/") target.searchParams.set("next", path);
    const r = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!signedIn && (path.startsWith("/app") || path.startsWith("/mfa"))) return redirectWithCookies("/sign-in");
  if (signedIn && (path === "/sign-in" || path === "/sign-up")) return redirectWithCookies("/app");
  return response;
}

export const config = {
  // Everything except static assets and the API, which checks its own bearer token.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|api/).*)"],
};
