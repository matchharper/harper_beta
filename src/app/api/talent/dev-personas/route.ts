import { NextRequest, NextResponse } from "next/server";
import { getFreshRequestUser, supabaseServer } from "@/lib/supabaseServer";
import { canInspectCareerAgentMessages } from "@/lib/internalAccess";
import { isTestTalentAccount } from "@/lib/testAccounts";
import {
  fetchDevPersonaRunForUser,
  fetchDevPersonaRunTarget,
  isDevPersonaEnabled,
  listDevPersonaRuns,
  type DevPersonaCurrentResponse,
  type DevPersonaListResponse,
} from "@/lib/career/devPersonas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Dev servers only. A signed-out browser may enter a persona test account;
// a signed-in user must be a team member or a persona account switching.
async function authorize(req: NextRequest) {
  if (!isDevPersonaEnabled()) return { error: 404 as const };
  const user = await getFreshRequestUser(req);
  if (!user) return { user: null };
  if (!canInspectCareerAgentMessages(user.email) && !(await isTestTalentAccount(user.id)))
    return { error: 403 as const };
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth)
    return NextResponse.json({ error: "Unavailable" }, { status: auth.error });
  try {
    const current = auth.user
      ? await fetchDevPersonaRunForUser(auth.user.id)
      : null;
    if (req.nextUrl.searchParams.get("current") === "1") {
      const body: DevPersonaCurrentResponse = { current };
      return NextResponse.json(body, { headers: NO_STORE });
    }
    const body: DevPersonaListResponse = {
      personas: await listDevPersonaRuns(),
      currentRunId: current?.id ?? null,
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("Dev persona lookup failed", error);
    return NextResponse.json(
      { error: "페르소나 기록을 불러오지 못했어요." },
      { status: 500 }
    );
  }
}

// Issues a one-time sign-in token for a persona test account only.
export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if ("error" in auth)
    return NextResponse.json({ error: "Unavailable" }, { status: auth.error });
  try {
    const { runId } = (await req.json().catch(() => ({}))) as {
      runId?: string;
    };
    if (!runId)
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    const target = await fetchDevPersonaRunTarget(runId);
    // Only accounts marked in talent_test_accounts can be entered.
    if (!target?.email)
      return NextResponse.json(
        { error: "테스트 계정이 아닌 기록이에요." },
        { status: 400 }
      );
    const { data, error } = await supabaseServer.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (error || !data.properties?.hashed_token)
      throw error ?? new Error("Missing sign-in token");
    return NextResponse.json(
      { tokenHash: data.properties.hashed_token, email: target.email },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Dev persona sign-in failed", error);
    return NextResponse.json(
      { error: "페르소나 계정으로 전환하지 못했어요." },
      { status: 500 }
    );
  }
}
