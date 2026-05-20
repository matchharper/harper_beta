import { NextRequest, NextResponse } from "next/server";
import { parseCareerEmailOnboardingToken } from "@/lib/careerEmailOnboarding/token";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/server";

type UntypedAdmin = TalentAdminClient & {
  from: (table: string) => any;
};

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

export async function GET(req: NextRequest) {
  const configured =
    process.env.CAREER_EMAIL_ONBOARDING_CALENDAR_URL?.trim() ||
    "https://calendly.com/chris-matchharper/30min";
  const fallbackUrl = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;

  try {
    const leadId = req.nextUrl.searchParams.get("lead") ?? "";
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const parsed = parseCareerEmailOnboardingToken(token, "calendar");
    if (parsed.leadId !== leadId) {
      throw new Error("Invalid lead token");
    }

    const admin = toUntypedAdmin(getTalentSupabaseAdmin());
    const now = new Date().toISOString();
    const { data: lead } = await admin
      .from("career_email_onboarding_leads")
      .select("id, local_id, metadata")
      .eq("id", leadId)
      .eq("normalized_email", parsed.email)
      .maybeSingle();

    if (lead?.id) {
      const metadata =
        lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
      await admin
        .from("career_email_onboarding_leads")
        .update({
          metadata: {
            ...metadata,
            calendarClickedAt: now,
          },
        })
        .eq("id", lead.id);
      await admin.from("career_email_onboarding_events").insert({
        event_type: "calendar_clicked",
        lead_id: lead.id,
        local_id: lead.local_id ?? null,
        metadata: {
          clickedAt: now,
        },
      });
    }
  } catch (error) {
    console.error("[career-email-onboarding] calendar click failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.redirect(fallbackUrl);
}
