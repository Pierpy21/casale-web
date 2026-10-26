import "server-only";
import { cookies } from "next/headers";
import PocketBase from "pocketbase";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, pocketbaseServerUrl } from "./config";

/** Client PocketBase legato al token di un utente (per verificarne l'identita' con authRefresh). */
export function createUserPb(token: string): PocketBase {
  const pb = new PocketBase(pocketbaseServerUrl());
  pb.autoCancellation(false);
  pb.authStore.save(token, null);
  return pb;
}

export async function readAuthToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTH_COOKIE_NAME)?.value || null;
}

/** Imposta il cookie di sessione. Solo in Server Actions o Route Handler. */
export async function setAuthCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
