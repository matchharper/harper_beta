import { NextRequest, NextResponse } from "next/server";
import {
  OrgHttpError,
  passOrgCompanyIntro,
  requestOrgCompanyIntro,
} from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function errorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/company-intro]", error);
  return NextResponse.json(
    { error: "제안을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();
    const common = {
      introCandidateId: String(body.introCandidateId ?? "").trim(),
      user,
      workspaceId: String(body.workspaceId ?? "").trim(),
    };
    if (action === "pass") {
      return NextResponse.json(await passOrgCompanyIntro(common));
    }
    if (action === "request") {
      return NextResponse.json(
        await requestOrgCompanyIntro({
          ...common,
          companyAppeal: String(body.companyAppeal ?? ""),
          introRecipientEmails: Array.isArray(body.introRecipientEmails)
            ? body.introRecipientEmails.map((value) => String(value))
            : [],
          nextStageId: String(body.nextStageId ?? "").trim(),
        })
      );
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
