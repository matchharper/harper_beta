import { NextRequest, NextResponse } from "next/server";
import {
  buildCareerEmailOnboardingToken,
  parseCareerEmailOnboardingToken,
} from "@/lib/careerEmailOnboarding/token";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
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
  const buildInternalCallStartUrl = (args?: {
    email?: string | null;
    leadId?: string | null;
  }) => {
    const url = new URL("/career_login", req.nextUrl.origin);
    url.searchParams.set("next", "/career/onboarding?start=call");
    url.searchParams.set("source", "email_onboarding_call");
    if (args?.email) url.searchParams.set("mail", args.email);
    if (args?.email && args.leadId) {
      url.searchParams.set(
        CAREER_EMAIL_ONBOARDING_TOKEN_PARAM,
        buildCareerEmailOnboardingToken({
          email: args.email,
          leadId: args.leadId,
          purpose: "login",
        })
      );
    }
    return url;
  };
  let redirectUrl = buildInternalCallStartUrl();

  try {
    const leadId = req.nextUrl.searchParams.get("lead") ?? "";
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const parsed = parseCareerEmailOnboardingToken(token, "calendar");
    if (parsed.leadId !== leadId) {
      throw new Error("Invalid lead token");
    }
    redirectUrl = buildInternalCallStartUrl({
      email: parsed.email,
      leadId: parsed.leadId,
    });

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
          redirectedToInternalCallStart: true,
        },
      });
    }
  } catch (error) {
    console.error("[career-email-onboarding] calendar click failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.redirect(redirectUrl);
}
