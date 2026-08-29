import { NextRequest, NextResponse } from "next/server";

import { verifyCareerPendingActionRef } from "@/lib/career/pendingActionRef.server";
import { resolveCareerPendingActionOpenTarget } from "@/lib/career/pendingActions.server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { ref?: unknown };
    const verifiedRef = verifyCareerPendingActionRef(body.ref);
    if (!verifiedRef || verifiedRef.talentId !== user.id) {
      return NextResponse.json(
        { error: "Pending action reference is invalid" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const setting = await fetchTalentSetting({ admin, userId: user.id });
    if (!setting?.is_onboarding_done) {
      return NextResponse.json(
        {
          code: "pending_action_unavailable",
          error: "Pending action is unavailable",
        },
        { status: 410 }
      );
    }

    const target = await resolveCareerPendingActionOpenTarget({
      admin,
      locale: setting.preferred_locale,
      profileVisibility: setting.profile_visibility,
      reference: verifiedRef.reference,
      talentId: user.id,
    });
    if (!target) {
      return NextResponse.json(
        {
          code: "pending_action_unavailable",
          error: "Pending action is unavailable",
        },
        { status: 410 }
      );
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("[CareerPendingActionResolve] Failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to resolve pending action" },
      { status: 500 }
    );
  }
}
