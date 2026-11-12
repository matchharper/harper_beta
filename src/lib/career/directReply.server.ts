import { toTalentMessageResponse, type TalentMessageRow } from "@/lib/talentOnboarding/models";
import { careerExecutionEnvironment } from "./executionEnvironment";
import { processCareerInvocation, publishCareerInvocations, type CareerInvocationDelivery } from "./work/invocations";
import type { WorkScope } from "./work/store";

/** Start immediately; after retains execution if the HTTP connection closes.
 * Only a busy, interrupted or suspended invocation needs a queued handoff. */
export function startCareerReply(
  scope: WorkScope,
  source: TalentMessageRow,
  after: (work: () => Promise<void>) => void,
  delivery: CareerInvocationDelivery = {},
) {
  const execution = (async () => {
    const { data, error } = await (scope.admin.from as any)("talent_external_operations")
      .select("*").eq("user_id", scope.userId).eq("conversation_id", scope.conversationId)
      .eq("kind", "career_invocation").is("parent_id", null).neq("status", "completed")
      .eq("request->>execution_environment", careerExecutionEnvironment())
      .contains("request", { input_message_ids: [source.id] })
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return false;
    return processCareerInvocation(scope, data.id, {
      ...delivery, initialInvocation: data, initialSourceMessage: source, scheduleAfter: after,
    });
  })().catch(error => {
    // Admission is durable: recover its inbox, never resubmit the user's input.
    console.warn("[career-direct] execution deferred", { sourceMessageId: source.id, error });
    return false as const;
  });
  after(async () => {
    if (await execution === false) await publishCareerInvocations(scope);
  });
  return execution;
}

/** The durable inbox owns execution. The HTTP stream is only live delivery. */
export function streamCareerReply(
  scope: WorkScope,
  source: TalentMessageRow,
  after: (work: () => Promise<void>) => void,
  prepared: Pick<CareerInvocationDelivery, "initialSetting" | "initialConversation" | "deadlineAt"> = {},
) {
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (!connected) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { connected = false; }
      };
      send("admitted", { userMessage: toTalentMessageResponse(source) });
      const heartbeat = setInterval(() => send("ping", null), 15_000);
      void startCareerReply(scope, source, after, {
        ...prepared,
        onLiveMessage: message => send("activity", { message }),
        onArtifactMessage: message => send("message", { message }),
      }).then(result => send(result === false ? "deferred" : "done", null)).finally(() => {
        clearInterval(heartbeat);
        if (connected) { connected = false; controller.close(); }
      });
    },
    cancel() { connected = false; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
