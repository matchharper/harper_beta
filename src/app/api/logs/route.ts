import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

type LogBody = {
  type?: string;
  userId?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LogBody;
  try {
    body = (await req.json()) as LogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = String(body?.type ?? "").trim();
  if (!type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  // Never trust client-provided userId for ownership.
  const userId = user.id;
  const { data, error } = await supabaseServer
    .from("logs")
    .insert({ type, user_id: userId })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to insert log" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
