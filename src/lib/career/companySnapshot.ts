import type { Json } from "@/types/database.types";
import {
  getTalentSupabaseAdmin,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { client } from "@/lib/llm/llm";

/**
 * Escapes LIKE/ILIKE special characters (%, _, \) so that user-supplied
 * strings are treated as literals rather than wildcard patterns.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

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

  const researchFailed =
    typeof (content as Record<string, unknown>)?.error === "string" &&
    ((content as Record<string, unknown>).error as string).length > 0;
  const status: CompanySnapshotStatus = researchFailed ? "failed" : "completed";
  const sourceUrls = extractSourceUrls(content);

  const { data, error } = await ((
    args.admin.from("company_snapshot" as any) as any
  )
    .insert({
      company_db_id: companyDb?.id ?? null,
      company_name: args.companyName.trim(),
      content,
      normalized_company_name: normalizeCompanySnapshotName(args.companyName),
      source_urls: sourceUrls,
      status,
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

export async function runCompanySnapshotResearch(args: {
  companyDbId: number | null;
  companyName: string;
  reason?: string | null;
}): Promise<Record<string, unknown>> {
  const prompt = buildCompanyResearchPrompt(args);
  const primaryModel = "gpt-4.1";
  const fallbackModel = "gpt-4o";

  const callResponses = async (model: string) => {
    return (client as any).responses.create({
      model,
      tools: [{ type: "web_search" }],
      input: prompt,
    });
  };

  try {
    let response: any;
    let modelUsed = primaryModel;
    try {
      response = await callResponses(primaryModel);
    } catch (primaryError) {
      console.warn(
        "[research_company] primary model failed, falling back",
        {
          companyName: args.companyName,
          primaryModel,
          fallbackModel,
          error:
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError),
        }
      );
      response = await callResponses(fallbackModel);
      modelUsed = fallbackModel;
    }
    console.info("[research_company] OpenAI Responses API ok", {
      companyName: args.companyName,
      modelUsed,
    });
    return parseCompanyResearchOutput(response);
  } catch (error) {
    console.error("[research_company] OpenAI Responses API failed", error);
    return {
      error: "research_failed",
      reason: "external_api_error",
    };
  }
}

function buildCompanyResearchPrompt(args: {
  companyDbId: number | null;
  companyName: string;
  reason?: string | null;
}): string {
  const MAX_COMPANY_NAME_LENGTH = 100;
  const MAX_REASON_LENGTH = 200;
  const safeName = args.companyName
    .replace(/[\n\r]/g, " ")
    .trim()
    .slice(0, MAX_COMPANY_NAME_LENGTH);
  const safeReason = args.reason
    ? args.reason.replace(/[\n\r]/g, " ").trim().slice(0, MAX_REASON_LENGTH)
    : null;
  const reasonLine = safeReason
    ? `\n사용자가 이 회사에 관심을 갖게 된 맥락: ${safeReason}`
    : "";
  return [
    `당신은 한국어 커리어 어드바이저 Harper의 회사 리서치 도우미입니다.`,
    `대상 회사: ${safeName}`,
    reasonLine,
    ``,
    `Web search 도구를 적극 활용해 이 회사의 사업, 제품, 비즈니스 모델, 자금/재무 상태, 팀/문화, 채용 맥락, 리스크/논란을 조사하세요.`,
    `최신 공개 정보를 우선시하고, 가능한 경우 한국 시장 맥락도 함께 고려하세요.`,
    ``,
    `반드시 아래 JSON 스키마를 그대로 채워서 단일 JSON 객체로만 답하세요. 마크다운 코드펜스나 설명 텍스트를 추가하지 마세요.`,
    `{`,
    `  "summary": "한국어로 작성된 4~8문장 요약. 회사가 무엇을 하는지, 핵심 강점/리스크, 채용 맥락이 자연스럽게 녹아 있어야 합니다.",`,
    `  "sections": {`,
    `    "company_overview": "사업/제품/규모/투자/주요 지표를 정리한 한국어 본문.",`,
    `    "risks": "리스크, 우려, 논란, 불확실성을 정리한 한국어 본문. 없다면 '특별히 두드러진 리스크는 확인되지 않았습니다.' 식으로 작성.",`,
    `    "hiring_context": "채용/팀 분위기/현재 채용 트렌드/지원자 입장에서 알아두면 좋은 한국어 본문."`,
    `  },`,
    `  "sources": [`,
    `    { "url": "https://example.com/article", "title": "출처 제목" }`,
    `  ]`,
    `}`,
    ``,
    `출처는 실제로 참고한 URL만 최대 10개까지 포함하세요. 정보가 부족한 섹션은 '확실한 정보를 찾지 못했습니다.' 처럼 솔직히 작성하세요.`,
  ].join("\n");
}

function parseCompanyResearchOutput(
  response: any
): Record<string, unknown> {
  const outputText: string = (() => {
    if (typeof response?.output_text === "string" && response.output_text) {
      return response.output_text;
    }
    // Fallback: try to read from common Responses API shapes
    try {
      const items: any[] = Array.isArray(response?.output) ? response.output : [];
      const collected: string[] = [];
      for (const item of items) {
        const contents: any[] = Array.isArray(item?.content) ? item.content : [];
        for (const part of contents) {
          if (typeof part?.text === "string") collected.push(part.text);
        }
      }
      return collected.join("\n");
    } catch {
      return "";
    }
  })();

  const fallback: Record<string, unknown> = {
    summary: outputText,
    sections: {},
    sources: [],
  };

  if (!outputText) return fallback;

  const trimmed = outputText.trim();
  // Strip code fences if the model returned them despite instructions
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to plain-text fallback
  }
  return fallback;
}

function extractSourceUrls(content: Record<string, unknown>): string[] {
  const sources = (content as { sources?: unknown }).sources;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const url = (entry as { url?: unknown }).url;
        if (typeof url === "string") return url.trim();
      }
      return "";
    })
    .filter((value) => value.length > 0)
    .slice(0, 10);
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

export function formatCompanySnapshotMessage(args: {
  reused: boolean;
  snapshot: CompanySnapshotRow;
}) {
  const content =
    args.snapshot.content && typeof args.snapshot.content === "object"
      ? (args.snapshot.content as Record<string, unknown>)
      : {};
  const errorReason = (content as { error?: unknown }).error;
  if (typeof errorReason === "string" && errorReason.length > 0) {
    return [
      `${args.snapshot.company_name} 회사 조사 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.`,
      "",
      COMPANY_SNAPSHOT_FOLLOW_UP,
    ].join("\n");
  }
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
      ...(sourceText ? ["", "출처:", sourceText] : []),
      "",
      COMPANY_SNAPSHOT_FOLLOW_UP,
    ]
      .filter((line) => line !== undefined && line !== null)
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
    .ilike("name", `%${escapeLikePattern(companyName)}%`)
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(error.message ?? "Failed to read company db");
  }

  return (data ?? null) as { id: number; name: string | null } | null;
}

export async function touchConversation(
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
