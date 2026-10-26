import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, pocketbaseServerUrl } from "./config";

/** Rotte dell'area admin che non richiedono sessione (o non sono pagine). */
const PUBLIC_ADMIN_PATHS = [
  "/admin/login",
  "/admin/manifest.webmanifest",
  "/admin/offline.html",
  "/admin/sw.js",
  "/admin/icons",
];

const REFRESH_WITHIN_MS = 24 * 60 * 60 * 1000;

/** Scadenza (ms) del JWT, senza verificarne la firma (la verifica e' fatta da PocketBase). */
function jwtExpiryMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}

/** Rinnova il token PocketBase quando e' vicino alla scadenza. Errori di rete: si mantiene il token. */
async function refreshToken(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${pocketbaseServerUrl()}/api/collections/users/auth-refresh`, {
      method: "POST",
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return token;
  }
}

/**
 * Protegge /admin/*: senza cookie valido redirect a /admin/login.
 * Non tocca il sito pubblico ne' /api (esclusi dal matcher di middleware.ts).
 */
export async function updateSession(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const expiry = token ? jwtExpiryMs(token) : null;
  const valid = expiry !== null && expiry > Date.now();

  if (!valid) {
    if (isPublic) return NextResponse.next();
    return redirectToLogin(req);
  }

  if (expiry! - Date.now() < REFRESH_WITHIN_MS) {
    const fresh = await refreshToken(token);
    if (!fresh) {
      if (isPublic) {
        const res = NextResponse.next();
        res.cookies.delete(AUTH_COOKIE_NAME);
        return res;
      }
      return redirectToLogin(req);
    }
    const res = NextResponse.next();
    if (fresh !== token) {
      res.cookies.set(AUTH_COOKIE_NAME, fresh, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return res;
  }

  return NextResponse.next();
}
