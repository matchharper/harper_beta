import { NextRequest, NextResponse } from "next/server";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import {
  DEV_EXTERNAL_VARIANT_COOKIE,
  isDevExternalVariant,
  readDevExternalVariant,
} from "@/lib/externalRecommendationsV2/devVariant";
import { devExternalVariantSnapshot } from "@/lib/externalRecommendationsV2/devVariant.server";

export const runtime = "nodejs";

async function handle(req: NextRequest, save: boolean) {
  const user = await getFreshRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCareerDevControls(user.email))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let selection = readDevExternalVariant(req.cookies.get(DEV_EXTERNAL_VARIANT_COOKIE)?.value, user.id);
  if (save) {
    const body = await req.json().catch(() => null);
    if (!isDevExternalVariant(body?.selection))
      return NextResponse.json({ error: "Invalid recommendation version" }, { status: 400 });
    selection = body.selection;
  }
  const response = NextResponse.json(devExternalVariantSnapshot(user.id, selection), {
    headers: { "Cache-Control": "private, no-store" },
  });
  if (save) response.cookies.set(DEV_EXTERNAL_VARIANT_COOKIE, `${user.id}:${selection}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/talent",
    maxAge: selection === "auto" ? 0 : 30 * 24 * 60 * 60,
  });
  return response;
}

export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
