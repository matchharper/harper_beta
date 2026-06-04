import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

type LogBody = {
  isMobile?: unknown;
  metadata?: unknown;
  type?: string;
  userId?: string;
};

type LogMetadata = Record<string, string | number | boolean | null>;

function isLogMetadata(value: unknown): value is LogMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (metadataValue) =>
      metadataValue === null ||
      typeof metadataValue === "string" ||
      typeof metadataValue === "number" ||
      typeof metadataValue === "boolean"
  );
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return new NextResponse(null, { status: 204 });
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

  let metadata: LogMetadata | undefined;
  if (body.metadata !== undefined) {
    if (!isLogMetadata(body.metadata)) {
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    }
    if (Object.keys(body.metadata).length > 0) {
      metadata = body.metadata;
    }
  }

  // Never trust client-provided userId for ownership.
  const userId = user.id;
  const isMobile =
    typeof body.isMobile === "boolean" ? body.isMobile : undefined;
  const { data, error } = await supabaseServer
    .from("logs")
    .insert({
      type,
      user_id: userId,
      ...(typeof isMobile === "boolean" ? { is_mobile: isMobile } : {}),
      ...(metadata ? { meta_data: metadata } : {}),
    })
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
