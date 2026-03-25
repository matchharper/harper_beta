import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import { doesEmailMatchInvitationDomain } from "@/lib/invitation";

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

type RedeemBody = {
  code?: string;
  name?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 }
    );
  }

  let body: RedeemBody;
  try {
    body = (await req.json()) as RedeemBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", code: "invalid_json" },
      { status: 400 }
    );
  }

  const code = String(body?.code ?? "").trim();
  const inputName = String(body?.name ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { error: "Missing code", code: "missing_code" },
      { status: 400 }
    );
  }

  const { data: inviteCode, error: inviteCodeError } = await supabaseServer
    .from("company_code")
    .select("id, count, limit, credit, domain")
    .eq("code", code)
    .maybeSingle();

  if (inviteCodeError) {
    return NextResponse.json(
      { error: inviteCodeError.message, code: "invite_code_read_failed" },
      { status: 500 }
    );
  }

  if (!inviteCode) {
    return NextResponse.json(
      { error: "Invalid invite code", code: "invalid_invite_code" },
      { status: 404 }
    );
  }

  if (inviteCode.count >= inviteCode.limit) {
    return NextResponse.json(
      { error: "Invite code exhausted", code: "invite_code_exhausted" },
      { status: 409 }
    );
  }

  if (!doesEmailMatchInvitationDomain(user.email, inviteCode.domain)) {
    return NextResponse.json(
      {
        error: "Invite code domain mismatch",
        code: "invite_domain_mismatch",
      },
      { status: 403 }
    );
  }

  const { data: existingCompanyUser, error: existingCompanyUserError } =
    await supabaseServer
      .from("company_users")
      .select("user_id, name, is_authenticated")
      .eq("user_id", user.id)
      .maybeSingle();

  if (existingCompanyUserError) {
    return NextResponse.json(
      {
        error: existingCompanyUserError.message,
        code: "company_user_read_failed",
      },
      { status: 500 }
    );
  }

  if (!existingCompanyUser) {
    const { error: createCompanyUserError } = await supabaseServer
      .from("company_users")
      .insert({
        user_id: user.id,
        email: user.email ?? null,
        name:
          inputName ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          "Anonymous",
        profile_picture: user.user_metadata?.avatar_url ?? null,
        is_authenticated: false,
      });

    if (createCompanyUserError) {
      return NextResponse.json(
        {
          error: createCompanyUserError.message,
          code: "company_user_create_failed",
        },
        { status: 500 }
      );
    }
  }

  const { data: companyUser, error: companyUserError } = await supabaseServer
    .from("company_users")
    .select("name, is_authenticated")
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyUserError || !companyUser) {
    return NextResponse.json(
      {
        error: companyUserError?.message ?? "Not found",
        code: "company_user_missing",
      },
      { status: 500 }
    );
  }

  if (isMissingDisplayName(companyUser.name) && !inputName) {
    return NextResponse.json(
      { error: "Missing name", code: "missing_name" },
      { status: 400 }
    );
  }

  const shouldMarkAuthenticated = !companyUser.is_authenticated;
  const initialCredit =
    typeof inviteCode.credit === "number" && Number.isFinite(inviteCode.credit)
      ? inviteCode.credit
      : 0;

  const updatePayload: {
    name?: string;
    is_authenticated?: boolean;
  } = {};
  if (inputName) {
    updatePayload.name = inputName;
  }
  if (shouldMarkAuthenticated) {
    updatePayload.is_authenticated = true;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateCompanyUserError } = await supabaseServer
      .from("company_users")
      .update(updatePayload)
      .eq("user_id", user.id);

    if (updateCompanyUserError) {
      return NextResponse.json(
        {
          error: updateCompanyUserError.message,
          code: "company_user_update_failed",
        },
        { status: 500 }
      );
    }
  }

  if (shouldMarkAuthenticated) {
    const { data: creditsRow, error: creditsReadError } = await supabaseServer
      .from("credits")
      .select("id, remain_credit, charged_credit")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creditsReadError) {
      return NextResponse.json(
        { error: creditsReadError.message, code: "credits_read_failed" },
        { status: 500 }
      );
    }

    if (creditsRow?.id) {
      const nextRemainCredit = (creditsRow.remain_credit ?? 0) + initialCredit;
      const nextChargedCredit =
        (creditsRow.charged_credit ?? 0) + initialCredit;

      const { error: creditsUpdateError } = await supabaseServer
        .from("credits")
        .update({
          remain_credit: nextRemainCredit,
          charged_credit: nextChargedCredit,
        })
        .eq("id", creditsRow.id);

      if (creditsUpdateError) {
        return NextResponse.json(
          { error: creditsUpdateError.message, code: "credits_update_failed" },
          { status: 500 }
        );
      }
    } else {
      const { error: creditsInsertError } = await supabaseServer
        .from("credits")
        .insert({
          user_id: user.id,
          remain_credit: initialCredit,
          charged_credit: initialCredit,
          type: "initial",
        });

      if (creditsInsertError) {
        return NextResponse.json(
          { error: creditsInsertError.message, code: "credits_insert_failed" },
          { status: 500 }
        );
      }
    }

    const nextCount = inviteCode.count + 1;
    const { error: companyCodeUpdateError } = await supabaseServer
      .from("company_code")
      .update({ count: nextCount })
      .eq("id", inviteCode.id)
      .lt("count", inviteCode.limit);

    if (companyCodeUpdateError) {
      return NextResponse.json(
        {
          error: companyCodeUpdateError.message,
          code: "invite_code_update_failed",
        },
        { status: 500 }
      );
    }

    if (initialCredit !== 0) {
      const { error: creditsHistoryInsertError } = await supabaseServer
        .from("credits_history")
        .insert({
          user_id: user.id,
          charged_credits: initialCredit,
          event_type: "invitation_code",
        });

      if (creditsHistoryInsertError) {
        return NextResponse.json(
          {
            error: creditsHistoryInsertError.message,
            code: "credits_history_insert_failed",
          },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    alreadyAuthenticated: !shouldMarkAuthenticated,
  });
}
