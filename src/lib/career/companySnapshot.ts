import type { Json } from "@/types/database.types";
import {
  getTalentSupabaseAdmin,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

export const COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS = 30;
export const COMPANY_SNAPSHOT_SETUP_MESSAGE_TYPE = "company_snapshot_setup";
export const COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE = "company_snapshot";
const COMPANY_SNAPSHOT_FOLLOW_UP =
  "더 궁금한 건 없으신가요? Harper가 외부에서 접근하기 어려운 정보들까지 함께 참고해서 알려드려요.";

export type CompanySnapshotStatus = "pending" | "completed" | "failed";

export type CompanySnapshotRow = {
  company_db_id: number | null;
  company_name: string;
  content: Json;
  created_at: string;
  error_message: string | null;
  id: string;
  normalized_company_name: string;
  source_urls: Json;
  status: CompanySnapshotStatus;
  updated_at: string;
};

export type CompanySnapshotSetupPayload = {
  buttonLabel: string;
  cacheWindowDays: number;
  cachedAvailable: boolean;
  companyName: string;
  reason: string | null;
  subtitle: string;
  title: string;
};

export type SerializedCompanySnapshot = {
  companyDbId: number | null;
  companyName: string;
  content: Json;
  createdAt: string;
  id: string;
  reused: boolean;
  sourceUrls: Json;
  status: CompanySnapshotStatus;
};

export function normalizeCompanySnapshotName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\(주\)|㈜|주식회사|유한회사/g, " ")
    .replace(
      /\b(inc|inc\.|corp|corp\.|corporation|co|co\.|ltd|ltd\.|llc)\b/g,
      " "
    )
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCompanySnapshotSetupPayload(
  content: string
): CompanySnapshotSetupPayload | null {
  try {
    const parsed = JSON.parse(content) as Partial<CompanySnapshotSetupPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.companyName !== "string" || !parsed.companyName.trim()) {
      return null;
    }

    const companyName = parsed.companyName.trim();
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim()
        : `${companyName} 회사 조사`;
    const subtitle =
      typeof parsed.subtitle === "string" && parsed.subtitle.trim()
        ? parsed.subtitle.trim()
        : `${companyName}에 대한 회사 snapshot을 만들어볼게요.`;
    const buttonLabel =
      typeof parsed.buttonLabel === "string" && parsed.buttonLabel.trim()
        ? parsed.buttonLabel.trim()
        : "회사 조사 시작";

    return {
      buttonLabel,
      cacheWindowDays: COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS,
      cachedAvailable: Boolean(parsed.cachedAvailable),
      companyName,
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : null,
      subtitle,
      title,
    };
  } catch {
    return null;
  }
}

export function toCompanySnapshotResponseMessage(item: TalentMessageRow) {
  const setup =
    item.message_type === COMPANY_SNAPSHOT_SETUP_MESSAGE_TYPE
      ? parseCompanySnapshotSetupPayload(item.content)
      : null;

  return {
    id: item.id,
    role: item.role,
    content: setup ? setup.title : item.content,
    messageType: item.message_type ?? "chat",
    createdAt: item.created_at,
    companySnapshotSetup: setup,
  };
}

export async function prepareCompanySnapshot(args: {
  admin: AdminClient;
  companyName: string;
  conversationId: string;
  reason?: string | null;
  userId: string;
}) {
  const companyName = args.companyName.trim();
  if (!companyName) {
    throw new Error("companyName is required");
  }

  const recentSnapshot = await fetchRecentCompanySnapshot({
    admin: args.admin,
    companyName,
  });
  const payload: CompanySnapshotSetupPayload = {
    buttonLabel: "회사 조사 시작",
    cacheWindowDays: COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS,
    cachedAvailable: Boolean(recentSnapshot),
    companyName,
    reason: args.reason?.trim() || null,
    subtitle: recentSnapshot
      ? `최근 ${COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS}일 안에 저장된 ${companyName} snapshot이 있어요. 필요하면 바로 불러올게요.`
      : `${companyName}에 대한 회사 정보, 리스크, 채용 맥락을 확인해볼게요.`,
    title: `${companyName} 회사 조사`,
  };

  const { data: message, error: messageError } = await args.admin
    .from("talent_messages")
    .insert({
      content: JSON.stringify(payload),
      conversation_id: args.conversationId,
      message_type: COMPANY_SNAPSHOT_SETUP_MESSAGE_TYPE,
      role: "assistant",
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (messageError) {
    throw new Error(
      messageError.message ?? "Failed to create company snapshot setup message"
    );
  }

  await touchConversation(args.admin, args.conversationId, args.userId);

  return {
    messages: [toCompanySnapshotResponseMessage(message as TalentMessageRow)],
    setup: payload,
  };
}

export async function startCompanySnapshot(args: {
  admin: AdminClient;
  companyName: string;
  conversationId: string;
  reason?: string | null;
  userId: string;
}) {
  const companyName = args.companyName.trim();
  if (!companyName) {
    throw new Error("companyName is required");
  }

  const result = await getOrCreateCompanySnapshot({
    admin: args.admin,
    companyName,
    reason: args.reason ?? null,
    userId: args.userId,
  });
  const messageContent = formatCompanySnapshotMessage({
    reused: result.reused,
    snapshot: result.snapshot,
  });

  const { data: message, error: messageError } = await args.admin
    .from("talent_messages")
    .insert({
      content: messageContent,
      conversation_id: args.conversationId,
      message_type: COMPANY_SNAPSHOT_RESULT_MESSAGE_TYPE,
      role: "assistant",
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (messageError) {
    throw new Error(
      messageError.message ?? "Failed to create company snapshot message"
    );
  }

  await touchConversation(args.admin, args.conversationId, args.userId);

  return {
    message: toCompanySnapshotResponseMessage(message as TalentMessageRow),
    reused: result.reused,
    snapshot: serializeCompanySnapshot(result.snapshot, result.reused),
  };
}

export async function getOrCreateCompanySnapshot(args: {
  admin: AdminClient;
  companyName: string;
  reason?: string | null;
  userId: string;
}) {
  const recentSnapshot = await fetchRecentCompanySnapshot({
    admin: args.admin,
    companyName: args.companyName,
  });
  if (recentSnapshot) {
    return {
      reused: true,
      snapshot: recentSnapshot,
    };
  }

  const companyDb = await findCompanyDbByName({
    admin: args.admin,
    companyName: args.companyName,
  });
  const content = await runCompanySnapshotResearch({
    companyName: args.companyName,
    companyDbId: companyDb?.id ?? null,
    reason: args.reason ?? null,
  });

  const { data, error } = await ((
    args.admin.from("company_snapshot" as any) as any
  )
    .insert({
      company_db_id: companyDb?.id ?? null,
      company_name: args.companyName.trim(),
      content,
      normalized_company_name: normalizeCompanySnapshotName(args.companyName),
      source_urls: [],
      status: "completed",
    })
    .select("*")
    .single() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to save company snapshot");
  }

  return {
    reused: false,
    snapshot: data as CompanySnapshotRow,
  };
}

export async function fetchRecentCompanySnapshot(args: {
  admin: AdminClient;
  companyName: string;
}) {
  const normalized = normalizeCompanySnapshotName(args.companyName);
  if (!normalized) return null;

  const companyDb = await findCompanyDbByName({
    admin: args.admin,
    companyName: args.companyName,
  });
  const threshold = new Date(
    Date.now() - COMPANY_SNAPSHOT_CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  if (companyDb) {
    const { data, error } = await ((
      args.admin.from("company_snapshot" as any) as any
    )
      .select("*")
      .eq("company_db_id", companyDb.id)
      .eq("status", "completed")
      .gte("created_at", threshold)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as any);

    if (error) {
      throw new Error(error.message ?? "Failed to read company snapshot");
    }
    if (data) return data as CompanySnapshotRow;
  }

  const { data, error } = await ((
    args.admin.from("company_snapshot" as any) as any
  )
    .select("*")
    .eq("normalized_company_name", normalized)
    .eq("status", "completed")
    .gte("created_at", threshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to read company snapshot");
  }

  return (data ?? null) as CompanySnapshotRow | null;
}

export async function runCompanySnapshotResearch(_args: {
  companyDbId: number | null;
  companyName: string;
  reason?: string | null;
}): Promise<Record<string, unknown>> {
  return {};
}

function serializeCompanySnapshot(
  snapshot: CompanySnapshotRow,
  reused: boolean
): SerializedCompanySnapshot {
  return {
    companyDbId: snapshot.company_db_id,
    companyName: snapshot.company_name,
    content: snapshot.content,
    createdAt: snapshot.created_at,
    id: snapshot.id,
    reused,
    sourceUrls: snapshot.source_urls,
    status: snapshot.status,
  };
}

function formatCompanySnapshotMessage(args: {
  reused: boolean;
  snapshot: CompanySnapshotRow;
}) {
  const content =
    args.snapshot.content && typeof args.snapshot.content === "object"
      ? (args.snapshot.content as Record<string, unknown>)
      : {};
  const summary =
    typeof content.summary === "string" && content.summary.trim()
      ? content.summary.trim()
      : null;
  const sourceText = Array.isArray(args.snapshot.source_urls)
    ? args.snapshot.source_urls
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 5)
        .join("\n")
    : "";

  if (summary) {
    return [
      args.reused
        ? `${args.snapshot.company_name} 회사 조사 결과를 최근 저장된 snapshot에서 불러왔습니다.`
        : `${args.snapshot.company_name} 회사 조사를 완료했습니다.`,
      "",
      summary,
      "",
      COMPANY_SNAPSHOT_FOLLOW_UP,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    args.reused
      ? `${args.snapshot.company_name} 회사 조사 snapshot을 최근 저장분에서 불러왔습니다.`
      : `${args.snapshot.company_name} 회사 조사 snapshot을 저장했습니다.`,
    "",
    "현재 회사 조사 함수는 아직 비어 있어서 표시할 분석 내용은 없습니다. 조사 로직을 연결하면 이 메시지에 실제 snapshot 요약이 표시됩니다.",
    "",
    COMPANY_SNAPSHOT_FOLLOW_UP,
  ].join("\n");
}

async function findCompanyDbByName(args: {
  admin: AdminClient;
  companyName: string;
}) {
  const companyName = args.companyName.trim();
  if (!companyName) return null;

  const { data, error } = await ((args.admin.from("company_db" as any) as any)
    .select("id, name")
    .ilike("name", companyName)
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to read company db");
  }

  return (data ?? null) as { id: number; name: string | null } | null;
}

async function touchConversation(
  admin: AdminClient,
  conversationId: string,
  userId: string
) {
  await admin
    .from("talent_conversations")
    .update({
      stage: "chat",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", userId);
}
