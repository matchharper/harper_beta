import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAccessBaseUrl,
  notifySlackSignupApprovalCandidate,
} from "@/lib/requestAccess/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import {
  getCompanyBootstrapDisposition,
  normalizeCompanyAuthEntrySource,
} from "@/lib/authPersona";

const PERSONA_CONFLICT_ERROR_CODES = new Set(["23505", "23514"]);

function talentPersonaResponse(userId: string) {
  return NextResponse.json({
    ok: true,
    created: false,
    persona: "talent",
    reason: "talent_user_exists",
    redirectTo: "/career",
    userId,
  });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    source?: string;
  };
  const entrySource = normalizeCompanyAuthEntrySource(body.source);
  const isOrgEntry = entrySource === "org";

  const [existingCompanyResult, existingTalentResult] = await Promise.all([
    supabaseServer
      .from("company_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabaseServer
      .from("talent_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (existingCompanyResult.error || existingTalentResult.error) {
    return NextResponse.json(
      {
        error:
          existingCompanyResult.error?.message ??
          existingTalentResult.error?.message ??
          "Failed to read user persona",
      },
      { status: 500 }
    );
  }

  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    name:
      user.user_metadata?.full_name ?? user.user_metadata?.name ?? "Anonymous",
    profile_picture: user.user_metadata?.avatar_url ?? null,
  };
  const disposition = getCompanyBootstrapDisposition({
    hasCompanyUser: Boolean(existingCompanyResult.data),
    hasTalentUser: Boolean(existingTalentResult.data),
  });

  let created = false;
  if (disposition === "existing_company") {
    const { error: updateError } = await supabaseServer
      .from("company_users")
      .update({
        email: payload.email,
        name: payload.name,
        profile_picture: payload.profile_picture,
      })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: updateError.message ?? "Failed to update company user",
        },
        { status: 500 }
      );
    }
  } else if (disposition === "existing_talent") {
    return talentPersonaResponse(user.id);
  } else {
    const { error: insertError } = await supabaseServer
      .from("company_users")
      .insert(payload);

    if (!insertError) {
      created = true;
    } else if (PERSONA_CONFLICT_ERROR_CODES.has(insertError.code ?? "")) {
      const [racedCompanyResult, racedTalentResult] = await Promise.all([
        supabaseServer
          .from("company_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseServer
          .from("talent_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (racedCompanyResult.error || racedTalentResult.error) {
        return NextResponse.json(
          {
            error:
              racedCompanyResult.error?.message ??
              racedTalentResult.error?.message ??
              "Failed to resolve concurrent user bootstrap",
          },
          { status: 500 }
        );
      }
      if (!racedCompanyResult.data && racedTalentResult.data) {
        return talentPersonaResponse(user.id);
      }
      if (!racedCompanyResult.data) {
        return NextResponse.json(
          {
            error:
              insertError.message ??
              "Failed to create company user due to persona conflict",
          },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error: insertError.message ?? "Failed to create company user",
        },
        { status: 500 }
      );
    }
  }

  if (created && user.email && !isOrgEntry) {
    try {
      await notifySlackSignupApprovalCandidate({
        userId: user.id,
        email: user.email,
        name: payload.name,
        baseUrl: getRequestAccessBaseUrl(req),
        entrySource,
      });
    } catch (error) {
      console.error("[auth/bootstrap] signup slack notify error:", error);
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    persona: "company",
    userId: user.id,
  });
}
