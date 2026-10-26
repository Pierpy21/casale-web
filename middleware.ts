import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/pocketbase/middleware";

// Solo l'area admin: il sito pubblico, /api/cron e gli asset non passano da qui.
export async function middleware(req: NextRequest) {
  return updateSession(req);
}

export const config = {
  matcher: ["/admin/:path*"],
};
