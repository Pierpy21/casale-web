"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import PocketBase, { ClientResponseError } from "pocketbase";
import { fail, invalidInput } from "@/lib/action-utils";
import { pocketbaseServerUrl } from "@/lib/pocketbase/config";
import { clearAuthCookie, setAuthCookie } from "@/lib/pocketbase/server";
import type { ActionResult } from "@/lib/types";

const LoginSchema = z.object({
  email: z.string().trim().pipe(z.email({ message: "Email non valida" })),
  password: z.string().min(1, "Password obbligatoria"),
});

const ROLES = ["admin", "sala", "cucina"];

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return invalidInput(parsed.error);

  let token: string;
  let role: unknown;
  let active: unknown;
  try {
    const pb = new PocketBase(pocketbaseServerUrl());
    pb.autoCancellation(false);
    const auth = await pb.collection("users").authWithPassword(parsed.data.email, parsed.data.password);
    token = auth.token;
    role = auth.record.role;
    active = auth.record.active;
  } catch (err) {
    // 400: credenziali errate oppure account non autorizzato (authRule active = true).
    if (err instanceof ClientResponseError && err.status === 400) {
      return fail("Email o password non corretti.");
    }
    console.error("[auth] PocketBase non raggiungibile:", err);
    return fail("Servizio non disponibile. Riprova tra qualche minuto.");
  }

  if (!active || !ROLES.includes(String(role))) {
    return fail("Account non abilitato o disattivato.");
  }

  await setAuthCookie(token);
  redirect("/admin/agenda");
}

export async function signOut(): Promise<void> {
  await clearAuthCookie();
  redirect("/admin/login");
}
