import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 }
    );
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", code: "invalid_json" },
      { status: 400 }
    );
  }

  const code = String(body?.code ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { error: "Missing code", code: "missing_code" },
      { status: 400 }
    );
  }

  const { data: inviteCode, error: inviteCodeError } = await supabaseServer
    .from("company_code")
    .select("id, count, limit, credit")
    .eq("code", code)
    .maybeSingle();

  if (inviteCodeError) {
    return NextResponse.json(
      { error: inviteCodeError.message, code: "invite_code_read_failed" },
      { status: 500 }
    );
  }

  if (!inviteCode) {
    return NextResponse.json(
      { error: "Invalid invite code", code: "invalid_invite_code" },
      { status: 404 }
    );
  }

  if (inviteCode.count >= inviteCode.limit) {
    return NextResponse.json(
      { error: "Invite code exhausted", code: "invite_code_exhausted" },
      { status: 409 }
    );
  }

  const { data: companyUser, error: companyUserError } = await supabaseServer
    .from("company_users")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyUserError) {
    return NextResponse.json(
      { error: companyUserError.message, code: "company_user_read_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    requiresName: isMissingDisplayName(companyUser?.name),
    credit: inviteCode.credit,
  });
}
