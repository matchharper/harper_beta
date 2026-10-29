import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { activityRecord } from "@/lib/career/simulation/activityStore";
import { applicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import {
  executeApplicationReview,
  reviewRequestSchema,
} from "@/lib/career/simulation/applicationReviewService";
import {
  resumeApplicationBrowser,
  runApplicationBrowser,
} from "@/lib/career/simulation/applicationBrowserServer";
import { enqueueApplicationBrowser } from "@/lib/career/simulation/applicationBrowserQueue";
import type {
  SessionRecord,
  SessionStoreArgs,
} from "@/lib/career/simulation/sessionStore";

export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };

function continueBrowser(store: SessionStoreArgs, record: SessionRecord) {
  const browser = record.state.browser;
  if (
    record.state.status !== "active" ||
    !browser ||
    !["queued", "running", "waiting"].includes(browser.status)
  )
    return;
  if (browser.leaseUntil && Date.parse(browser.leaseUntil) > Date.now()) return;
  const batch = record.state.activity?.batches.findLast(
    (b) =>
      b.browser?.runId === browser.id &&
      b.status === "submitted" &&
      b.continuation === "pending"
  );
  if (browser.status === "waiting" && !batch) return;
  after(async () => {
    if (batch) await resumeApplicationBrowser(store, record, batch.id);
    if (process.env.NODE_ENV === "development")
      await runApplicationBrowser(store, record.messageId);
    else
      await enqueueApplicationBrowser(
        store.userId,
        store.conversationId,
        record.messageId,
        record.state.revision
      );
  });
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getTalentSupabaseAdmin();
  const messageId = req.nextUrl.searchParams.get("messageId"),
    roleId = req.nextUrl.searchParams.get("roleId"),
    jobSlug = req.nextUrl.searchParams.get("jobSlug");
  if (!messageId && !roleId && !jobSlug)
    return NextResponse.json(
      { error: "Application required" },
      { status: 400 }
    );
  let query = admin
    .from("talent_simulate_application")
    .select("*")
    .eq("user_id", user.id);
  if (messageId) {
    const id = Number(messageId);
    if (!Number.isSafeInteger(id) || id <= 0)
      return NextResponse.json(
        { error: "Invalid application" },
        { status: 400 }
      );
    query = query.eq("message_id", id);
  } else if (roleId) {
    if (!z.string().uuid().safeParse(roleId).success)
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    query = query.or(
      `role_ref.eq.role:${roleId},payload->activity->>roleId.eq.${roleId}`
    );
  } else query = query.eq("role_ref", `job:${jobSlug}`);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error)
    return NextResponse.json(
      { error: "Application unavailable" },
      { status: 503 }
    );
  const records = (data ?? [])
    .map((row) => {
      const store = {
        admin,
        userId: user.id,
        conversationId: row.conversation_id,
      };
      const record = activityRecord(row, store);
      if (messageId) continueBrowser(store, record);
      return applicationReviewView(record);
    })
    .filter((view) => view.review);
  return NextResponse.json({ applications: records }, { headers });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = reviewRequestSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await admin
    .from("talent_simulate_application")
    .select("*")
    .eq("user_id", user.id)
    .eq("message_id", parsed.data.messageId)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Application unavailable" },
      { status: 503 }
    );
  if (!data)
    return NextResponse.json(
      { error: "Application unavailable" },
      { status: 404 }
    );
  const store = {
    admin,
    userId: user.id,
    conversationId: data.conversation_id,
  };
  try {
    const record = await executeApplicationReview(
      store,
      activityRecord(data, store),
      parsed.data
    );
    continueBrowser(store, record);
    return NextResponse.json(
      { application: applicationReviewView(record) },
      { headers }
    );
  } catch (error) {
    console.error("[application-review]", error);
    return NextResponse.json(
      {
        error:
          "Application changed or could not be saved. Reload and review the current state.",
      },
      { status: 409 }
    );
  }
}
