import { buildCareerRealtimeSessionInstructions } from "../realtimeInstructions";
import { getCareerRealtimeToolCandidates } from "../llmTools";
import type { LiveSessionInstructionUpdate } from "../liveSessionUpdates";
import { RECORD_CALL_ANSWERS } from "../recordCallAnswersTool";
import { formatToolResultText } from "@/lib/llm/promptText";
import "server-only";
import type { CareerRequestRuntime } from "./requestRuntime.server";
import {
  runToolCall,
  unwrapToolCall,
  prepareToolDelivery,
} from "@/lib/llm/toolExecution";
import {
  formatToolError,
  toolErrorResult,
  projectToolDiagnosticFieldsForTransport,
} from "@/lib/llm/toolError";
import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  executeTalentTool,
  TalentToolError,
} from "@/lib/talentOnboarding/tools";

import {
  fetchMockInterviewContext,
  MockInterviewRequestError,
  readMockInterviewOpportunityId,
} from "@/lib/career/mockInterview";

type Body = {
  internalCallRequestId?: string;
  mockInterviewOpportunityId?: string;
  arguments?: Record<string, unknown>;
  channel?: string;
  conversationId?: string;
  name?: string;
  responseLocale?: string;
  toolCallId?: string;
};

export async function executeCareerToolRequest(
  req: NextRequest,
  runtime: CareerRequestRuntime
) {
  let capturedDiagnostics: readonly unknown[] = [];
  try {
    const user = await runtime.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const channel = body.channel === "voice" ? "voice" : "chat";
    const conversationId = String(body.conversationId ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        {
          error: conversationError.message ?? "Failed to read conversation",
          diagnostic: formatToolError(conversationError),
        },
        { status: 500 }
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const mockInterviewOpportunityId = readMockInterviewOpportunityId(body);
    let searchPurpose: "mock_interview" | undefined;
    if (
      channel === "voice" &&
      name === "web_search" &&
      mockInterviewOpportunityId
    ) {
      await fetchMockInterviewContext({
        admin,
        userId: user.id,
        opportunityId: mockInterviewOpportunityId,
      });
      searchPurpose = "mock_interview";
    }

    const toolCapture = await runToolCall(
      () =>
        executeTalentTool({
          channel,
          name,
          context: {
            admin,
            channel,
            searchPurpose,
            internalCallRequestId:
              channel === "voice" ? body.internalCallRequestId : null,
            conversationId,
            responseLocale:
              typeof body.responseLocale === "string"
                ? body.responseLocale
                : null,
            scheduleAfter: (task) => runtime.scheduleAfter(task),
            toolCallId: String(body.toolCallId ?? "").trim() || null,
            userId: user.id,
          },
          input:
            body.arguments && typeof body.arguments === "object"
              ? body.arguments
              : {},
        }),
      { callId: String(body.toolCallId ?? ""), name }
    );
    capturedDiagnostics = toolCapture.diagnostics;
    const output = unwrapToolCall(toolCapture);

    let liveSessionUpdate: LiveSessionInstructionUpdate | null = null;
    let nextStepInstructions: string | null = null;
    if (
      name === RECORD_CALL_ANSWERS &&
      channel === "voice" &&
      body.internalCallRequestId
    ) {
      try {
        const plan = await buildCareerRealtimeSessionInstructions({
          conversationId,
          internalCallRequestId: body.internalCallRequestId,
          userId: user.id,
          preferredLocale: body.responseLocale,
          toolNames: getCareerRealtimeToolCandidates(body.responseLocale).map(
            (tool) => tool.name
          ),
        });
        nextStepInstructions = plan.instructions;
        liveSessionUpdate = {
          instructions: plan.liveInstructions,
          onboardingContext: plan.liveOnboardingContext,
          internalCallContext: plan.internalCallContext,
        };
      } catch (error) {
        // The write already succeeded; the tool result still carries its saved facts.
        console.error("[call-answer-context]", error);
      }
    }
    return NextResponse.json({
      liveSessionUpdate,
      nextStepInstructions,
      ok: true,
      name,
      output: projectToolDiagnosticFieldsForTransport(output),
      modelOutput: prepareToolDelivery(toolCapture, formatToolResultText),
    });
  } catch (error) {
    if (
      error instanceof TalentToolError ||
      error instanceof MockInterviewRequestError
    ) {
      return NextResponse.json(toolErrorResult(error, capturedDiagnostics), {
        status: error.status,
      });
    }

    return NextResponse.json(toolErrorResult(error, capturedDiagnostics), {
      status: 500,
    });
  }
}
