import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { readPinnedAttachment } from "@/lib/career/externalOperations/attachments";
import { z } from "zod";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = z.string().uuid().safeParse((await context.params).id);
  if (!id.success) return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  try {
    const file = await readPinnedAttachment({ admin: getTalentSupabaseAdmin(), userId: user.id }, id.data);
    return new Response(new Uint8Array(file.bytes), { headers: {
      "Content-Type": file.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    } });
  } catch {
    return NextResponse.json({ error: "Attachment unavailable" }, { status: 404 });
  }
}
