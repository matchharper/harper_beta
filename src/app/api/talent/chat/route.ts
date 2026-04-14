import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { client } from "@/lib/llm/llm";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  normalizeTalentInsightKey,
  TalentConversationRow,
  TalentMessageRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP, TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { warmCache, getTestFlagSlugs, getContentForUser } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
  type InsightChecklistItem,
} from "@/lib/talentOnboarding/insightChecklist";
import {
  normalizeExtractedInsights,
} from "@/lib/talentOnboarding/insights";
import { logger } from "@/utils/logger";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

// ---------------------------------------------------------------------------
// System prompt builder: flat prompt from DB + dynamic context
// ---------------------------------------------------------------------------

function buildExistingInsightsSection(content: Record<string, string> | null): string {
  if (!content || Object.keys(content).length === 0) return "";
  const MAX_TOTAL = 2000;
  const MAX_PER_VALUE = 150;
  let section = "\n## 이미 알고 있는 정보 (재질문 금지, 더 깊은 질문에 활용)\n";
  let totalLen = section.length;
  const sortedEntries = Object.entries(content).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sortedEntries) {
    const truncated = value.length > MAX_PER_VALUE ? value.slice(0, MAX_PER_VALUE) + "..." : value;
    const line = `- "${key}": "${truncated}"\n`;
    if (totalLen + line.length > MAX_TOTAL) break;
    section += line;
    totalLen += line.length;
  }
  return section;
}

function buildSystemPrompt(args: {
  flatPrompt: string;
  profile: { resume_file_name?: string | null; resume_links?: string[] | null } | null;
  structuredProfileText: string;
  userTurnCount: number;
  currentInsightContent: Record<string, string> | null;
  uncoveredItems: InsightChecklistItem[];
  coveredCount: number;
}) {
  const {
    flatPrompt,
    profile,
    structuredProfileText,
    userTurnCount,
    currentInsightContent,
    uncoveredItems,
    coveredCount,
  } = args;

  const linkText = (profile?.resume_links ?? []).join(", ");
  const existingInsightsSection = buildExistingInsightsSection(currentInsightContent);
  const topUncovered = uncoveredItems
    .slice(0, 3)
    .map((item) => `- ${item.promptHint}`)
    .join("\n");

  return [
    flatPrompt,
    "",
    existingInsightsSection,
    "",
    `Insight coverage: ${coveredCount}/${INSIGHT_CHECKLIST.length} items covered.`,
    "Prioritize naturally asking about these uncovered topics (one at a time):",
    topUncovered,
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    structuredProfileText || "[Structured Talent Profile]\n(none)",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Separate insight extraction (same approach as chat/save)
// ---------------------------------------------------------------------------

function buildInsightExtractionPrompt(
  uncoveredItems: InsightChecklistItem[],
  coveredCount: number,
  totalCount: number,
  currentInsightContent: Record<string, string> | null
): string {
  const checklistLines = uncoveredItems
    .map((item) => `- "${item.key}": ${item.promptHint}`)
    .join("\n");

  let existingSection = "";
  if (currentInsightContent && Object.keys(currentInsightContent).length > 0) {
    existingSection =
      "\n## Currently Known Insights\n" +
      Object.entries(currentInsightContent)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 20)
        .map(
          ([k, v]) =>
            `- "${k}": "${v.length > 150 ? v.slice(0, 150) + "..." : v}"`
        )
        .join("\n");
  }

  return `You are an insight extraction assistant. Given a conversation turn between a user and Harper (an AI career counselor), extract structured career insights.

Insight coverage: ${coveredCount}/${totalCount} items covered.
${existingSection}

## Checklist (extract when mentioned)
${checklistLines}

You may also extract free-form insights as snake_case keys with Korean values.

## Response Format
Return a valid JSON object:
{
  "extracted_insights": {
    "key_name": { "value": "extracted value in Korean", "action": "new" | "update" }
  }
}

- "new": key has no existing value
- "update": user corrected or enriched a previously known insight (value = final integrated text)
- If nothing to extract, return: { "extracted_insights": {} }
- Only include keys where the user provided clear information.`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await warmCache();
    const testSlugs = await getTestFlagSlugs(user.id);

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const [profile, currentInsights] = await Promise.all([
      fetchTalentUserProfile({ admin, userId: user.id }),
      fetchTalentInsights({ admin, userId: user.id }),
    ]);
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 3000,
    });

    const currentInsightContent = (currentInsights?.content ?? null) as Record<string, string> | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;

    const normalizedContent = link
      ? `${message}\n\n참고 링크: ${link}`
      : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const recentMessages = await fetchRecentMessages({
      admin,
      conversationId,
      limit: 24,
    });

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    // Load flat prompt from DB, inject channel type
    const flatPrompt = (getContentForUser("career-chat", testSlugs) ?? "")
      .replace(/\{channel_type\}/g, "Chat");

    const systemPrompt = buildSystemPrompt({
      flatPrompt,
      profile,
      structuredProfileText,
      userTurnCount,
      currentInsightContent,
      uncoveredItems,
      coveredCount,
    });

    // --- Conversation LLM call (natural language, no JSON mode) ---
    const assistantText = await runTalentAssistantCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        ...llmMessages,
      ],
      temperature: 0.55,
    });

    const safeAssistantText =
      assistantText.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    // --- Save assistant message ---
    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantText,
          message_type: "chat",
        })
        .select("*")
        .single();

    if (assistantError) {
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    // --- Separate insight extraction call ---
    let newKeysCount = 0;
    try {
      const extractionPrompt = buildInsightExtractionPrompt(
        uncoveredItems,
        coveredCount,
        INSIGHT_CHECKLIST.length,
        currentInsightContent
      );

      const extractionResponse = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: normalizedContent },
          { role: "assistant", content: safeAssistantText },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const rawExtraction = (
        extractionResponse.choices[0]?.message?.content ?? ""
      ).replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsed: { extracted_insights?: Record<string, unknown> } = {};
      try {
        parsed = JSON.parse(rawExtraction);
      } catch {
        const match = rawExtraction.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* skip */ }
        }
      }

      const extractedInsights = normalizeExtractedInsights(
        (parsed.extracted_insights as Record<string, unknown>) ?? null
      );

      if (extractedInsights) {
        const processedInsights: Record<string, string> = {};

        for (const [rawKey, extracted] of Object.entries(extractedInsights)) {
          const key = normalizeTalentInsightKey(rawKey);
          if (!key || !extracted.value) continue;

          const existingValue = currentInsightContent?.[key]?.trim();

          if (extracted.action === "update") {
            processedInsights[key] = extracted.value;
          } else {
            if (!existingValue) {
              processedInsights[key] = extracted.value;
            }
          }
        }

        if (Object.keys(processedInsights).length > 0) {
          newKeysCount = Object.keys(processedInsights).filter(
            (k) => !currentInsightContent?.[k]?.trim()
          ).length;

          const finalContent: Record<string, string> = {
            ...(currentInsightContent ?? {}),
            ...processedInsights,
          };

          await upsertTalentInsights({
            admin,
            userId: user.id,
            content: finalContent,
          });
        }
      }
    } catch (insightError) {
      logger.log("[TalentChat] Failed to extract insights", {
        userId: user.id,
        error:
          insightError instanceof Error
            ? insightError.message
            : "Unknown error",
      });
    }

    // --- Completion check: coverage-based ---
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const coverageRatio = INSIGHT_CHECKLIST.length > 0
      ? insightsCoveredAfter / INSIGHT_CHECKLIST.length
      : 1;
    const isCompleted = coverageRatio >= TALENT_INTERVIEW_MIN_COVERAGE;

    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    const toResponseMessage = (item: TalentMessageRow) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      messageType: item.message_type ?? "chat",
      createdAt: item.created_at,
    });

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: insightsCoveredAfter,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
