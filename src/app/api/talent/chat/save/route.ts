import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { client } from "@/lib/llm/llm";
import {
  countUserChatTurns,
  fetchTalentInsights,
  getTalentSupabaseAdmin,
  normalizeTalentInsightKey,
  upsertTalentInsights,
  type TalentConversationRow,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP, TALENT_INTERVIEW_MIN_COVERAGE } from "@/lib/talentOnboarding/progress";
import { warmCache, getTestFlagSlugs, getContentForUser } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
  type InsightChecklistItem,
} from "@/lib/talentOnboarding/insightChecklist";
import { normalizeExtractedInsights } from "@/lib/talentOnboarding/insights";
import {
  loadPrompt,
  extractSection,
  fillPlaceholders,
} from "@/lib/talentOnboarding/prompts";
import { logger } from "@/utils/logger";

type Body = {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  isCallMode?: boolean;
};

function buildInsightExtractionOnlyPrompt(
  uncoveredItems: InsightChecklistItem[],
  coveredCount: number,
  totalCount: number,
  currentInsightContent: Record<string, string> | null,
  insightMdOverride?: string
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

  const md = insightMdOverride ?? loadPrompt("insight-extraction.md");
  return fillPlaceholders(extractSection(md, "extractionOnly"), {
    coveredCount,
    totalCount,
    checklistLines,
    existingInsightsSection: existingSection,
  });
}

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
    const userMessageText = body.userMessage?.trim();
    const assistantMessageText = body.assistantMessage?.trim();
    const isCallMode = Boolean(body.isCallMode);
    const messageType = isCallMode ? "call_transcript" : "chat";

    if (!conversationId || !userMessageText || !assistantMessageText) {
      return NextResponse.json(
        {
          error:
            "conversationId, userMessage, and assistantMessage are required",
        },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();

    // Verify conversation ownership
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Insert user message
    const { data: insertedUserMessage, error: userMsgError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: userMessageText,
        message_type: messageType,
      })
      .select("*")
      .single();

    if (userMsgError) {
      return NextResponse.json(
        { error: userMsgError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    // Insert assistant message
    const { data: insertedAssistantMessage, error: assistantMsgError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantMessageText,
          message_type: messageType,
        })
        .select("*")
        .single();

    if (assistantMsgError) {
      return NextResponse.json(
        {
          error:
            assistantMsgError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    // Fetch current insights for extraction context
    const currentInsights = await fetchTalentInsights({
      admin,
      userId: user.id,
    });
    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;

    // Run insight extraction
    let newKeysCount = 0;
    try {
      const draftInsightMd = getContentForUser("insight-extraction", testSlugs) ?? undefined;
      const extractionPrompt = buildInsightExtractionOnlyPrompt(
        uncoveredItems,
        coveredCount,
        INSIGHT_CHECKLIST.length,
        currentInsightContent,
        draftInsightMd
      );

      const extractionResponse = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: userMessageText },
          { role: "assistant", content: assistantMessageText },
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
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            logger.log("[ChatSave] JSON regex fallback parse failed");
          }
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
      logger.log("[ChatSave] Failed to extract insights", {
        userId: user.id,
        error:
          insightError instanceof Error
            ? insightError.message
            : "Unknown error",
      });
    }

    // Completion check: coverage-based
    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const coverageRatio =
      INSIGHT_CHECKLIST.length > 0
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
      error instanceof Error ? error.message : "Failed to save chat messages";
    console.error("[ChatSave] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
