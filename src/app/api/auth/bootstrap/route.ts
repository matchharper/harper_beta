import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("company_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message ?? "Failed to read company_users" },
      { status: 500 }
    );
  }

  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    name:
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      "Anonymous",
    profile_picture: user.user_metadata?.avatar_url ?? null,
  };

  const { error: upsertError } = await supabaseServer
    .from("company_users")
    .upsert(payload, { onConflict: "user_id" });

  if (upsertError) {
    return NextResponse.json(
      { error: upsertError.message ?? "Failed to upsert company_users" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: !existing,
    userId: user.id,
  });
}
