import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  isTalentNetworkReferralSource,
  TALENT_NETWORK_REFERRAL_QUERY_KEY,
} from "@/lib/talentNetworkReferral";

export const runtime = "nodejs";

type CreateReferralBody = {
  email?: string;
  name?: string;
  pagePath?: string;
  sharerLocalId?: string;
  source?: string;
};

function makeToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getBaseUrl(req: Request) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  let body: CreateReferralBody;
  try {
    body = (await req.json()) as CreateReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(body.name ?? "").trim() || null;
  const pagePath = String(body.pagePath ?? "").trim() || "/network";
  const sharerLocalId = String(body.sharerLocalId ?? "").trim() || null;
  const source = String(body.source ?? "").trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "Valid email is required" },
      { status: 400 }
    );
  }

  if (!isTalentNetworkReferralSource(source)) {
    return NextResponse.json(
      { error: "Invalid share source" },
      { status: 400 }
    );
  }

  const token = makeToken();
  const now = new Date().toISOString();
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin
    .from("talent_network_referral_links")
    .insert({
      created_from_path: pagePath,
      sharer_email: email,
      sharer_local_id: sharerLocalId,
      sharer_name: name,
      source,
      token,
      updated_at: now,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = new URL("/network", getBaseUrl(req));
  url.searchParams.set(TALENT_NETWORK_REFERRAL_QUERY_KEY, token);

  return NextResponse.json(
    {
      ok: true,
      token,
      url: url.toString(),
    },
    { status: 200 }
  );
}
