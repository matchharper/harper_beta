import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, any>;

const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
};

const outputPath = argValue("--output");
const incidentUserId = argValue("--incident-user-id");
const incidentExcludeMessageId = Number(
  argValue("--incident-exclude-message-id") || 0
);
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
).trim();

if (!outputPath || !incidentUserId || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "--output, --incident-user-id, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required"
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const recommendationSelect = `
  id,
  talent_id,
  role_id,
  created_at,
  viewed_at,
  feedback,
  feedback_reason,
  saved_stage,
  fit_summary,
  company_role:company_roles!inner (
    name,
    status,
    is_expired,
    expires_at,
    location_text,
    type,
    work_mode,
    source_type,
    company_workspace:company_workspace!inner (
      company_name,
      company_db:company_db (employee_count_range)
    )
  )
`;

const aliasFor = (userId: string) =>
  `account_${createHash("sha256").update(userId).digest("hex").slice(0, 10)}`;

const isActiveInternal = (row: JsonRecord) => {
  const role = row.company_role;
  if (!role || role.source_type !== "internal") return false;
  if (
    String(role.status ?? "")
      .trim()
      .toLowerCase() !== "active"
  )
    return false;
  if (role.is_expired) return false;
  const expiresAt = Date.parse(String(role.expires_at ?? ""));
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
};

async function pendingRecommendations(userId: string) {
  const { data, error } = await admin
    .from("talent_opportunity_recommendation")
    .select(recommendationSelect)
    .eq("talent_id", userId)
    .eq("company_role.source_type", "internal")
    .is("feedback", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data ?? []) as JsonRecord[]).filter(isActiveInternal);
}

async function captureAccountCase(args: {
  caseId: string;
  excludeMessageId?: number;
  userId: string;
}) {
  const [recommendations, settingResult, conversationResult] =
    await Promise.all([
      pendingRecommendations(args.userId),
      admin
        .from("talent_setting")
        .select("is_onboarding_done,preferred_locale")
        .eq("user_id", args.userId)
        .maybeSingle(),
      admin
        .from("talent_conversations")
        .select("id,stage,updated_at")
        .eq("user_id", args.userId)
        .neq("stage", "profile")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (settingResult.error) throw settingResult.error;
  if (conversationResult.error) throw conversationResult.error;
  if (!recommendations[0])
    throw new Error(`${args.caseId}: no pending internal opportunity`);

  const conversation = conversationResult.data as JsonRecord | null;
  let messages: JsonRecord[] = [];
  if (conversation?.id) {
    const { data, error } = await admin
      .from("talent_messages")
      .select("id,role,content,message_type,created_at")
      .eq("conversation_id", conversation.id)
      .eq("user_id", args.userId)
      .in("role", ["user", "assistant"])
      .order("id", { ascending: false })
      .limit(30);
    if (error) throw error;
    messages = ((data ?? []) as JsonRecord[])
      .filter(
        (message) =>
          !args.excludeMessageId || Number(message.id) < args.excludeMessageId
      )
      .slice(0, 16)
      .reverse();
  }

  const latestMessage = messages[messages.length - 1] ?? null;
  const primary = recommendations[0];
  const primaryRole = primary.company_role;
  const latestAnchorMs = Math.max(
    Date.parse(String(latestMessage?.created_at ?? "")) || 0,
    Date.parse(String(primary.created_at ?? "")) || 0
  );
  const currentAccessAt = new Date(
    (latestAnchorMs || Date.now()) + 13 * 60 * 60 * 1000
  ).toISOString();

  return {
    accountAlias: aliasFor(args.userId),
    currentAccessAt,
    id: args.caseId,
    idleMs: 13 * 60 * 60 * 1000,
    isOnboardingDone: Boolean(settingResult.data?.is_onboarding_done),
    pendingActions: [
      {
        actionKey: "pending_1",
        companyName: primaryRole.company_workspace.company_name,
        kind: "internal_opportunity",
        recommendedAt: primary.created_at,
        recommendationSummary: primary.fit_summary ?? null,
        roleTitle: primaryRole.name,
      },
    ],
    pendingInternalCountAtCapture: recommendations.length,
    preferredLocale: settingResult.data?.preferred_locale ?? "ko",
    previousChatAt: latestMessage?.created_at ?? null,
    recentMessages: messages.map((message) => ({
      content: message.content,
      createdAt: message.created_at,
      messageType: message.message_type,
      role: message.role,
    })),
    recentRecommendations: recommendations.map((row) => ({
      companyName: row.company_role.company_workspace.company_name,
      companySize:
        row.company_role.company_workspace.company_db?.employee_count_range ??
        null,
      employmentTypes: Array.isArray(row.company_role.type)
        ? row.company_role.type
        : [],
      feedback: null,
      feedbackReason: row.feedback_reason ?? null,
      location: row.company_role.location_text ?? null,
      recommendedAt: row.created_at,
      recommendationId: row.id,
      roleId: row.role_id,
      savedStage: row.saved_stage ?? null,
      sourceType: "internal",
      title: row.company_role.name,
      upcomingMeetingAt: null,
      workMode: row.company_role.work_mode ?? null,
    })),
    source: "production_read_only_snapshot",
    structuredProfileText:
      "[Structured Talent Profile]\nAccount details omitted for evaluation privacy.",
  };
}

async function main() {
  const { data: poolData, error: poolError } = await admin
    .from("talent_opportunity_recommendation")
    .select(recommendationSelect)
    .eq("company_role.source_type", "internal")
    .is("feedback", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (poolError) throw poolError;

  const poolRows = ((poolData ?? []) as JsonRecord[]).filter(isActiveInternal);
  const pendingCountByUser = new Map<string, number>();
  for (const row of poolRows) {
    const userId = String(row.talent_id ?? "");
    if (!userId) continue;
    pendingCountByUser.set(userId, (pendingCountByUser.get(userId) ?? 0) + 1);
  }

  const candidateIds = [...pendingCountByUser.keys()]
    .filter((userId) => userId !== incidentUserId)
    .slice(0, 80);
  const { data: settingRows, error: settingsError } = await admin
    .from("talent_setting")
    .select("user_id,is_onboarding_done,preferred_locale")
    .in("user_id", candidateIds)
    .eq("is_onboarding_done", true);
  if (settingsError) throw settingsError;

  const eligibleSettings = (settingRows ?? []) as JsonRecord[];
  const selectedIds: string[] = [];
  const addCandidate = (userId: string | undefined) => {
    if (userId && !selectedIds.includes(userId)) selectedIds.push(userId);
  };
  addCandidate(
    eligibleSettings.find(
      (row) => (pendingCountByUser.get(String(row.user_id)) ?? 0) > 1
    )?.user_id
  );
  addCandidate(
    eligibleSettings.find(
      (row) => String(row.preferred_locale ?? "").toLowerCase() === "en"
    )?.user_id
  );
  for (const row of eligibleSettings) {
    addCandidate(String(row.user_id));
    if (selectedIds.length >= 4) break;
  }
  if (selectedIds.length < 4) {
    throw new Error(
      "Could not find four distinct eligible production accounts"
    );
  }

  const incidentBase = await captureAccountCase({
    caseId: "incident_repeat_1",
    excludeMessageId: incidentExcludeMessageId || undefined,
    userId: incidentUserId,
  });
  const productionCases = await Promise.all(
    selectedIds.slice(0, 4).map((userId, index) =>
      captureAccountCase({
        caseId: [
          "production_multi_pending",
          "production_english_locale",
          "production_account_3",
          "production_account_4",
        ][index],
        userId,
      })
    )
  );

  const syntheticBase = {
    accountAlias: "synthetic_account",
    currentAccessAt: "2026-09-08T03:00:00.000Z",
    idleMs: 13 * 60 * 60 * 1000,
    isOnboardingDone: true,
    preferredLocale: "ko",
    previousChatAt: "2026-09-07T01:00:00.000Z",
    recentMessages: [
      {
        content: "지난번 이야기한 방향은 그대로예요.",
        createdAt: "2026-09-07T01:00:00.000Z",
        messageType: "chat",
        role: "user",
      },
      {
        content: "네, 그 기준으로 계속 살펴볼게요.",
        createdAt: "2026-09-07T01:01:00.000Z",
        messageType: "chat",
        role: "assistant",
      },
    ],
    recentRecommendations: [
      {
        companyName: "Example Labs",
        companySize: null,
        employmentTypes: ["Full-time"],
        feedback: null,
        feedbackReason: null,
        location: "Seoul",
        recommendedAt: "2026-09-06T01:35:10.000Z",
        recommendationId: "synthetic-recommendation-1",
        roleId: "synthetic-role-1",
        savedStage: null,
        sourceType: "internal",
        title: "Applied AI Engineer",
        upcomingMeetingAt: null,
        workMode: "Hybrid",
      },
    ],
    source: "synthetic_challenge",
    structuredProfileText:
      "[Structured Talent Profile]\nSynthetic evaluation account.",
  };
  const syntheticInternalAction = {
    actionKey: "pending_1",
    companyName: "Example Labs",
    kind: "internal_opportunity",
    recommendedAt: "2026-09-06T01:35:10.000Z",
    recommendationSummary: null,
    roleTitle: "Applied AI Engineer",
  };

  const fixture = {
    capturedAt: new Date().toISOString(),
    cases: [
      incidentBase,
      { ...incidentBase, id: "incident_repeat_2" },
      { ...incidentBase, id: "incident_repeat_3" },
      ...productionCases,
      {
        ...syntheticBase,
        id: "synthetic_internal_no_summary",
        pendingActions: [syntheticInternalAction],
        pendingInternalCountAtCapture: 1,
      },
      {
        ...syntheticBase,
        id: "meeting_schedule_primary",
        pendingActions: [
          {
            actionKey: "pending_1",
            companyName: "Calendar Company",
            kind: "meeting_schedule",
            roleTitle: "Backend Engineer",
          },
        ],
        pendingInternalCountAtCapture: 1,
      },
      {
        ...syntheticBase,
        id: "company_request_primary",
        pendingActions: [
          {
            actionKey: "pending_1",
            companyName: "Request Company",
            kind: "company_request",
            request: "최근 프로젝트에서 맡은 범위를 알려주세요.",
            roleTitle: "ML Engineer",
          },
        ],
        pendingInternalCountAtCapture: 1,
      },
      {
        ...syntheticBase,
        id: "reevaluation_question_primary",
        pendingActions: [
          {
            actionKey: "pending_1",
            kind: "reevaluation_question",
            question: "영어로 기술 논의를 주도한 경험이 있으신가요?",
          },
        ],
        pendingInternalCountAtCapture: 1,
      },
      {
        ...syntheticBase,
        id: "no_pending_action",
        pendingActions: [],
        pendingInternalCountAtCapture: 0,
        recentRecommendations: [],
      },
    ],
    datasetVersion: "reengagement-messaging-v1",
    productionReadOnly: true,
  };

  mkdirSync(path.dirname(outputPath), { mode: 0o700, recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(outputPath, 0o600);
  process.stdout.write(
    `${JSON.stringify({ caseCount: fixture.cases.length, outputPath })}\n`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
