import { InternalApiError } from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  asObject,
  EmailBusyError,
  type EmailAdmin,
  type EmailRow,
} from "@/lib/email/runtime/types";
import { readRow, updateRow } from "@/lib/email/runtime/store";
import {
  isOpsEmailTest,
  OPS_EMAIL_TEST_KIND,
} from "@/lib/email/runtime/opsTest";
import { processEmailRuntimeMessage } from "@/lib/email/runtime/consumer";
import { EMAIL_ASSISTANT_MODEL } from "@/lib/email/runtime/model";
import type { Database } from "@/types/database.types";

type EmailTestHistoryRow = Pick<
  Database["public"]["Tables"]["email_reply_jobs"]["Row"],
  | "id"
  | "created_at"
  | "status"
  | "skip_reason"
  | "last_error"
  | "metadata"
  | "assistant_message_id"
> & { queue_dispatch_error: string | null };

export type OpsEmailTestCommand = {
  userId: string;
  requestId: string;
  previousJobId?: string;
  subject: string;
  content: string;
  model?: string;
};
export type OpsEmailTestItem = {
  id: string;
  createdAt: string;
  subject: string;
  content: string;
  model: string | null;
  reply: string | null;
  replyHtml: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  error: string | null;
};
export type OpsEmailTestHistory = {
  items: OpsEmailTestItem[];
  nextOffset: number | null;
};

function ownedTest(job: EmailRow | null, userId: string) {
  if (!job || !isOpsEmailTest(job) || job.talent_id !== userId)
    throw new InternalApiError(
      404,
      "이 계정의 이메일 테스트를 찾을 수 없습니다."
    );
  return job;
}

export async function createOpsEmailTest(
  command: OpsEmailTestCommand,
  actorId: string,
  admin: EmailAdmin = getTalentSupabaseAdmin()
) {
  const model = command.model?.trim() || EMAIL_ASSISTANT_MODEL;
  const existing = await readRow(admin, "email_reply_jobs", command.requestId);
  if (existing) {
    const job = ownedTest(existing, command.userId);
    const test = asObject(asObject(job.metadata).opsEmailTest);
    if (
      test.actorId !== actorId ||
      test.email?.text !== command.content ||
      test.email?.subject !== command.subject ||
      (test.model ?? EMAIL_ASSISTANT_MODEL) !== model
    )
      throw new InternalApiError(409, "이미 다른 입력에 사용된 요청입니다.");
    return { jobId: String(job.id) };
  }
  const profile = await readRow(
    admin,
    "talent_users",
    command.userId,
    "user_id"
  );
  if (!profile || profile.deleted_at)
    throw new InternalApiError(404, "계정을 찾을 수 없습니다.");
  if (!profile.email)
    throw new InternalApiError(400, "계정에 이메일 주소가 없습니다.");
  const existingInbound = await readRow(
    admin,
    "email_inbound_events",
    command.requestId
  );
  if (
    existingInbound &&
    (existingInbound.provider !== "ops_email_test" ||
      existingInbound.from_email !== profile.email ||
      existingInbound.subject !== command.subject)
  )
    throw new InternalApiError(409, "이미 다른 이메일에 사용된 요청입니다.");
  let conversationId: string;
  if (command.previousJobId) {
    const previous = ownedTest(
      await readRow(admin, "email_reply_jobs", command.previousJobId),
      command.userId
    );
    if (["queued", "processing"].includes(previous.status))
      throw new InternalApiError(409, "이전 답장을 처리 중입니다.");
    conversationId = previous.conversation_id;
  } else {
    // A dedicated, owned conversation keeps a test from resuming a live browser
    // or adopting a real email's company-sharing confirmation.
    const { data, error } = await admin
      .from("talent_conversations")
      .insert({
        user_id: command.userId,
        stage: "chat",
      })
      .select("id")
      .single();
    if (error) throw error;
    conversationId = data.id;
  }
  const conversation = await readRow(
    admin,
    "talent_conversations",
    conversationId
  );
  if (conversation?.user_id !== command.userId)
    throw new InternalApiError(409, "테스트 대화의 계정이 일치하지 않습니다.");
  const email = {
    from: profile.email,
    to: ["ops-test@reply.matchharper.com"],
    subject: command.subject,
    text: command.content,
    attachments: [],
  };
  const { error: inboundError } = await admin
    .from("email_inbound_events")
    .upsert(
      {
        id: command.requestId,
        provider: "ops_email_test",
        provider_email_id: command.requestId,
        from_email: profile.email,
        to_addresses: email.to,
        subject: command.subject,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (inboundError) throw inboundError;
  const { error: jobError } = await (admin as any)
    .from("email_reply_jobs")
    .upsert(
      {
        id: command.requestId,
        inbound_event_id: command.requestId,
        kind: OPS_EMAIL_TEST_KIND,
        worker_target: "vercel_queue",
        status: "queued",
        talent_id: command.userId,
        conversation_id: conversationId,
        metadata: { opsEmailTest: { actorId, email, model } },
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (jobError) throw jobError;
  const saved = ownedTest(
    await readRow(admin, "email_reply_jobs", command.requestId),
    command.userId
  );
  const savedTest = asObject(asObject(saved.metadata).opsEmailTest);
  if (
    savedTest.actorId !== actorId ||
    savedTest.email?.text !== command.content ||
    savedTest.email?.subject !== command.subject ||
    (savedTest.model ?? EMAIL_ASSISTANT_MODEL) !== model
  )
    throw new InternalApiError(409, "이미 다른 입력에 사용된 요청입니다.");
  return { jobId: command.requestId };
}

export async function runOpsEmailTest(
  userId: string,
  jobId: string,
  admin: EmailAdmin = getTalentSupabaseAdmin(),
  consume = processEmailRuntimeMessage
) {
  // This endpoint may execute only an owned test, never an actual inbound email.
  ownedTest(await readRow(admin, "email_reply_jobs", jobId), userId);
  await updateRow(admin, "email_reply_jobs", jobId, {
    queue_dispatch_error: null,
  });
  try {
    // Use the same lease, saved steps, tools and renderer without publishing to
    // Vercel Queue. Local Ops runs must execute the code running on this server.
    await consume({ version: 1, kind: "reply", jobId }, admin);
  } catch (error) {
    if (!(error instanceof EmailBusyError)) throw error;
  }
  const job = ownedTest(
    await readRow(admin, "email_reply_jobs", jobId),
    userId
  );
  return { pending: job.status === "queued" || job.status === "processing" };
}

export async function fetchOpsEmailTests(
  userId: string,
  offset = 0,
  admin: EmailAdmin = getTalentSupabaseAdmin()
): Promise<OpsEmailTestHistory> {
  const pageSize = 20;
  const { data, error } = await admin
    .from("email_reply_jobs")
    .select(
      "id,created_at,status,skip_reason,last_error,queue_dispatch_error,metadata,assistant_message_id"
    )
    .eq("talent_id", userId)
    .eq("kind", OPS_EMAIL_TEST_KIND)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize)
    .returns<EmailTestHistoryRow[]>();
  if (error) throw error;
  const jobs = data.slice(0, pageSize);
  const ids = jobs.flatMap((job) =>
    job.assistant_message_id ? [job.assistant_message_id] : []
  );
  const replies = ids.length
    ? await admin
        .from("talent_messages")
        .select("id,content")
        .eq("user_id", userId)
        .in("id", ids)
    : { data: [], error: null };
  if (replies.error) throw replies.error;
  const contents = new Map(replies.data.map((row) => [row.id, row.content]));
  return {
    items: jobs.map((job) => {
      const metadata = asObject(job.metadata);
      const test = asObject(metadata.opsEmailTest);
      const email = asObject(test.email);
      const completed =
        job.status === "skipped" && job.skip_reason === "ops_email_test";
      const pending = job.status === "queued" || job.status === "processing";
      return {
        id: job.id,
        createdAt: job.created_at,
        subject: String(email.subject ?? ""),
        content: String(email.text ?? ""),
        model: typeof test.model === "string" ? test.model : null,
        reply: contents.get(job.assistant_message_id!) ?? null,
        replyHtml:
          typeof metadata.delivery?.html === "string"
            ? metadata.delivery.html
            : null,
        status: completed
          ? "completed"
          : pending
            ? (job.status as "queued" | "processing")
            : "failed",
        error: completed
          ? null
          : job.last_error ||
            job.queue_dispatch_error ||
            (pending ? null : job.skip_reason),
      };
    }),
    nextOffset: data.length > pageSize ? offset + pageSize : null,
  };
}
