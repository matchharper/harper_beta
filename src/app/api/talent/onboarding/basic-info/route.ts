import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

type Body = {
  email?: string;
  name?: string;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const name = String(body.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    const email = String(body.email ?? "").trim().toLowerCase().slice(0, 320);

    if (!name) {
      return NextResponse.json(
        { error: "이름을 입력해주세요." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "유효한 이메일을 입력해주세요." },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { data, error } = await admin
      .from("talent_users")
      .update({
        email,
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id, email, name")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to save talent basic info" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save basic info";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
