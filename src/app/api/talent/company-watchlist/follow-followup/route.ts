import { NextRequest, NextResponse } from "next/server";
import { createTalentCompanyFollowFollowUpReply } from "@/lib/career/companyFollowUpReply";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { isMobileRequest } from "@/lib/requestDevice";

type Body = {
  companyDbId?: number | string;
  conversationId?: string | null;
};

const parseCompanyDbId = (value: unknown) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = String(body.conversationId ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const companyDbId = parseCompanyDbId(body.companyDbId);
    if (!companyDbId) {
      return NextResponse.json(
        { error: "companyDbId is required" },
        { status: 400 }
      );
    }

    const assistantMessage = await createTalentCompanyFollowFollowUpReply({
      admin: getTalentSupabaseAdmin(),
      companyDbId,
      conversationId,
      isMobile: isMobileRequest(req),
      userId: user.id,
    });

    return NextResponse.json({
      assistantMessage,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create company follow follow-up",
      },
      { status: 500 }
    );
  }
}
