import { NextRequest, NextResponse } from "next/server";
import {
  getSlackActivityDeviceLabel,
  notifySlackActivity,
} from "@/lib/slackActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  markTalentUserLoggedIn,
  toTalentDisplayName,
} from "@/lib/talentOnboarding/server";
import { claimTalentNetworkInvite } from "@/lib/talentOnboarding/networkClaim";
import { parseCareerEmailOnboardingToken } from "@/lib/careerEmailOnboarding/token";
import { normalizeCareerUtmSource } from "@/lib/career/utm";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import { enqueueSignupNoProfileSubmit } from "@/lib/contactQueue";
import type { Json } from "@/types/database.types";

type Body = {
  emailOnboardingToken?: string;
  inviteToken?: string;
  landingLocalId?: string;
  landingPath?: string;
  landingSource?: string;
  mail?: string;
};

const CAREER_SIGNUP_EVENT_TYPE = "career_signup_completed";
const OFFICIAL_JOB_SOURCE_EVENT_TYPES = [
  "job_apply_click",
  "jobs_cta_click",
  "job_detail_view",
  "job_list_click",
  "jobs_list_view",
] as const;

type OfficialJobSourceEvent = {
  event_type: string;
  job_slug: string | null;
  metadata: Json;
  path: string | null;
};

const normalizeOptionalText = (value: unknown, maxLength: number) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getMetadataText = (metadata: Json, key: string) => {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  if (typeof value !== "string") return null;
  return normalizeOptionalText(value, 120);
};

const formatOfficialJobSource = (event: OfficialJobSourceEvent | null) => {
  if (!event?.job_slug) return "/jobs landing";

  const roleTitle = getMetadataText(event.metadata, "roleTitle");
  const companyName = getMetadataText(event.metadata, "companyName");
  const roleLabel = [roleTitle, companyName].filter(Boolean).join(" @ ");
  const jobPath = `/jobs/${event.job_slug}`;

  return roleLabel ? `${jobPath} (${roleLabel})` : jobPath;
};

const pickOfficialJobSourceEvent = (
  events: OfficialJobSourceEvent[] | null
) => {
  const rows = events ?? [];
  const ctaEvent = rows.find(
    (event) =>
      event.event_type === "job_apply_click" ||
      event.event_type === "jobs_cta_click"
  );
  if (ctaEvent) {
    return ctaEvent.event_type === "job_apply_click" ? ctaEvent : null;
  }

  return (
    rows.find(
      (event) =>
        event.job_slug &&
        (event.event_type === "job_detail_view" ||
          event.event_type === "job_list_click")
    ) ?? null
  );
};

async function resolveSignupSourceDetail(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  localId: string | null;
  path: string | null;
  source: string | null;
}) {
  const source = normalizeCareerUtmSource(args.source);
  if (!source) return null;

  if (source !== OFFICIAL_JOBS_LANDING_SOURCE) {
    if (source === "career") return "career landing";
    return `${source} landing`;
  }

  if (!args.localId) return "/jobs landing";

  const { data, error } = await args.admin
    .from("official_job_events")
    .select("event_type, job_slug, metadata, path")
    .eq("anonymous_id", args.localId)
    .in("event_type", [...OFFICIAL_JOB_SOURCE_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn(
      "[talent/auth/bootstrap] official jobs source lookup failed:",
      error.message
    );
    return args.path?.startsWith("/jobs/") ? args.path : "/jobs landing";
  }

  const pickedEvent = pickOfficialJobSourceEvent(data ?? null);
  return formatOfficialJobSource(pickedEvent);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const emailOnboardingToken = String(
      body?.emailOnboardingToken ?? ""
    ).trim();
    const inviteToken = String(body?.inviteToken ?? "").trim();
    const landingLocalId = normalizeOptionalText(body?.landingLocalId, 120);
    const landingPath = normalizeOptionalText(body?.landingPath, 500);
    const landingSource = normalizeCareerUtmSource(body?.landingSource);
    const mail = String(body?.mail ?? "").trim();
    const admin = getTalentSupabaseAdmin();

    const { data: existingTalentUser, error: existingTalentUserError } =
      await admin
        .from("talent_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (existingTalentUserError) {
      return NextResponse.json(
        {
          error:
            existingTalentUserError.message ??
            "Failed to read talent user profile",
        },
        { status: 500 }
      );
    }

    let emailOnboardingClaim: {
      claimed: boolean;
      leadId: string;
      email: string;
    } | null = null;
    if (emailOnboardingToken) {
      let parsed: ReturnType<typeof parseCareerEmailOnboardingToken>;
      try {
        parsed = parseCareerEmailOnboardingToken(emailOnboardingToken, "login");
      } catch {
        return NextResponse.json(
          {
            error:
              "이메일 온보딩 링크가 만료되었거나 올바르지 않습니다. 랜딩페이지에서 다시 이메일을 남겨주세요.",
          },
          { status: 400 }
        );
      }
      const authEmail = String(user.email ?? "")
        .trim()
        .toLowerCase();
      if (!authEmail || authEmail !== parsed.email) {
        return NextResponse.json(
          {
            error:
              "이메일 온보딩 링크의 이메일과 로그인 계정의 이메일이 일치하지 않습니다.",
          },
          { status: 400 }
        );
      }

      const { data, error } = await (admin as any).rpc(
        "claim_career_email_onboarding_lead",
        {
          onboarding_lead_id: parsed.leadId,
          target_email: user.email ?? null,
          target_name: toTalentDisplayName(user),
          target_profile_picture: user.user_metadata?.avatar_url ?? null,
          target_user_id: user.id,
        }
      );
      if (error) {
        return NextResponse.json(
          {
            error:
              error.message ?? "Failed to claim career email onboarding lead",
          },
          { status: 500 }
        );
      }
      emailOnboardingClaim = {
        claimed: Boolean(data),
        email: parsed.email,
        leadId: parsed.leadId,
      };
    }

    await ensureTalentUserRecord({
      admin,
      user,
      mail: emailOnboardingClaim?.claimed ? null : mail || null,
    });
    const claim =
      inviteToken.length > 0
        ? await claimTalentNetworkInvite({
            admin,
            inviteToken,
            user,
          })
        : null;
    await markTalentUserLoggedIn({
      admin,
      userId: user.id,
    });

    if (!existingTalentUser) {
      const signupSourceDetail = await resolveSignupSourceDetail({
        admin,
        localId: landingLocalId,
        path: landingPath,
        source: landingSource,
      });

      const { error: logInsertError } = await admin.from("logs").insert({
        type: CAREER_SIGNUP_EVENT_TYPE,
        user_id: user.id,
      });
      if (logInsertError) {
        console.error(
          "[talent/auth/bootstrap] signup log insert error:",
          logInsertError
        );
      }

      if (!emailOnboardingClaim?.claimed) {
        await enqueueSignupNoProfileSubmit({
          admin,
          payload: {
            landingLocalId,
            landingPath,
            landingSource,
            sourceDetail: signupSourceDetail,
          },
          userId: user.id,
        }).catch((queueError) => {
          console.error(
            "[talent/auth/bootstrap] contact queue enqueue error:",
            queueError
          );
        });
      }

      try {
        await notifySlackActivity({
          action: "회원가입 완료",
          details: [
            { label: "Device", value: getSlackActivityDeviceLabel(req) },
            ...(signupSourceDetail
              ? [{ label: "Source", value: signupSourceDetail }]
              : []),
            ...(inviteToken ? [{ label: "Invite", value: "yes" }] : []),
            ...(emailOnboardingClaim?.claimed
              ? [
                  {
                    label: "Email onboarding",
                    value: emailOnboardingClaim.leadId,
                  },
                ]
              : []),
            ...(mail ? [{ label: "Mail alias", value: mail }] : []),
          ],
          user,
        });
      } catch (slackError) {
        console.error(
          "[talent/auth/bootstrap] signup slack notify error:",
          slackError
        );
      }
    }

    return NextResponse.json({
      claim,
      emailOnboardingClaim,
      ok: true,
      userId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to bootstrap talent user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
