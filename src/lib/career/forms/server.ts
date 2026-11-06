import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { z } from "zod";
import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
  type TalentMessageResponse,
} from "@/lib/talentOnboarding/models";
import {
  careerFormDraftSchema,
  careerFormResponseInputSchema,
  findCareerFormAction,
  getCareerFormContent,
  parseCareerForm,
  parseCareerFormResponse,
  type CareerForm,
  type CareerFormResponse,
  type CareerSuggestionAnswer,
} from "./schema";
import {
  buildCareerFormResponseMessage,
  buildCareerSuggestionResponseMessage,
  formatCareerFormForModel,
  formatCareerFormResponseForModel,
} from "./format";

type Admin = ReturnType<typeof getTalentSupabaseAdmin>;
type Scope = { admin: Admin; userId: string; conversationId: string };
const formInputSchema = z.object({
  action: z.enum(["create", "update", "read", "list", "present", "resolve"]),
  formId: z.number().int().positive().optional(),
  revision: z.number().int().positive().optional(),
  expectedRevision: z.number().int().positive().optional(),
  form: careerFormDraftSchema.optional(),
  beforeFormId: z.number().int().positive().optional(),
});

const actionProperties = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    message: { type: "string" },
  },
  required: ["id", "label", "message"],
  additionalProperties: false,
};
export const suggestFormTool = {
  type: "function" as const,
  function: {
    name: "suggest_form",
    description: TOOL_DESCRIPTIONS.suggest_form,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "read", "list", "present", "resolve"],
        },
        formId: { type: "integer" },
        revision: { type: "integer" },
        expectedRevision: { type: "integer" },
        beforeFormId: {
          type: "integer",
          description: "Pagination cursor returned by list",
        },
        form: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["suggestion", "form"] },
            title: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: {
                    type: "string",
                    description:
                      "Visible question/change context, including why the user is being asked. For suggestions, explain what information is missing and how it will help.",
                  },
                  type: {
                    type: "string",
                    description:
                      "text, textarea, select, multiselect, checkbox, change, document, markdown; other types display their content",
                  },
                  content: {
                    description:
                      "String or object. Inputs: value, options [{id,label}]. Change: originalText, suggestedText, reason, documentId, entryId. Document: owned documentId, optional revision. Markdown: value.",
                    anyOf: [
                      { type: "string" },
                      { type: "object", additionalProperties: true },
                    ],
                  },
                  positive: actionProperties,
                  negative: actionProperties,
                },
                required: ["id", "label", "type", "content"],
                additionalProperties: false,
              },
            },
            positive: actionProperties,
            negative: actionProperties,
            relatedRefs: {
              description:
                "Non-visible resource references needed to execute the chosen action, such as browser_session, role, document, URL or work. An answer wakes every active work reference. Preserve existing work links when reusing a shared question; all references must belong to this conversation.",
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  id: { type: "string" },
                },
                required: ["type", "id"],
                additionalProperties: false,
              },
            },
          },
          required: ["kind", "items"],
          additionalProperties: false,
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

async function assertConversation(scope: Scope) {
  const { data, error } = await scope.admin
    .from("talent_conversations")
    .select("id")
    .eq("id", scope.conversationId)
    .eq("user_id", scope.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation not found");
}

async function assertDocumentOwnership(scope: Scope, documentIds: string[]) {
  if (!documentIds.length) return [];
  const ids = [...new Set(documentIds)];
  const { data, error } = await scope.admin
    .from("talent_documents")
    .select("id,revision,file_name")
    .eq("talent_id", scope.userId)
    .eq("is_deleted", false)
    .in("id", ids);
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== ids.length) throw new Error("Document not found");
  return data!;
}

export async function readCareerForm(
  scope: Scope & { formId: number; revision?: number }
) {
  let query = scope.admin
    .from("talent_messages")
    .select("*")
    .eq("user_id", scope.userId)
    .eq("conversation_id", scope.conversationId)
    .eq("message_type", "career_form")
    .contains("payload", { formId: scope.formId });
  if (scope.revision !== undefined)
    query = query.contains("payload", { revision: scope.revision });
  const { data, error } = await query
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const form = parseCareerForm(data?.payload);
  if (!data || !form || form.hidden) throw new Error("Form not found");
  return { form, row: data as TalentMessageRow };
}

export async function readCareerFormResponses(
  scope: Scope & { formId: number }
) {
  const { data, error } = await scope.admin
    .from("talent_messages")
    .select("id,payload")
    .eq("user_id", scope.userId)
    .eq("conversation_id", scope.conversationId)
    .eq("message_type", "career_form_response")
    .contains("payload", { formId: scope.formId })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const response = parseCareerFormResponse(row.payload);
    return response ? [{ messageId: row.id, response }] : [];
  });
}

export async function listCareerForms(
  scope: Scope & { beforeFormId?: number }
) {
  await assertConversation(scope);
  let query = scope.admin
    .from("talent_messages")
    .select("id,payload")
    .eq("user_id", scope.userId)
    .eq("conversation_id", scope.conversationId)
    .eq("message_type", "career_form")
    .contains("payload", { revision: 1 })
    .or("payload->>hidden.is.null,payload->>hidden.eq.false");
  if (scope.beforeFormId) query = query.lt("id", scope.beforeFormId);
  const { data, error } = await query
    .order("id", { ascending: false })
    .limit(21);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const forms = await Promise.all(
    rows
      .slice(0, 20)
      .map((row) =>
        readCareerForm({ ...scope, formId: row.id }).then(
          (result) => result.form
        )
      )
  );
  return { forms, nextBeforeFormId: rows.length > 20 ? rows[19].id : null };
}

async function writeForm(
  scope: Scope,
  input: Record<string, unknown>
): Promise<TalentMessageRow> {
  const { data, error } = await (scope.admin.rpc as any)("write_career_form", {
    p_user_id: scope.userId,
    p_conversation_id: scope.conversationId,
    ...input,
  });
  if (error) throw new Error(error.message);
  const row = (data as { message?: TalentMessageRow })?.message ?? data;
  if (!row || typeof row.id !== "number")
    throw new Error("Form write returned no message");
  return row as TalentMessageRow;
}

export async function executeSuggestForm(
  args: Scope & {
    input: unknown;
    requestId?: string;
    workId?: string;
    presentForm?: (form: CareerForm) => Promise<void>;
    onMessage?: (message: TalentMessageResponse) => void | Promise<void>;
  }
) {
  const input = formInputSchema.parse(args.input);
  if (input.action === "resolve") {
    if (!input.formId || !input.revision) throw new Error("Exact form revision required");
    await writeForm(args, { p_action: "resolve", p_form_id: input.formId, p_revision: input.revision,
      p_payload: { reason: "Handled in the conversation", sourceRequestId: args.requestId }, p_request_id: args.requestId });
    return { ok: true, modelOutput: `Form ${input.formId} revision ${input.revision} no longer needs user input. This does not submit an application.` };
  }

  if (input.action === "list") {
    const result = await listCareerForms({
      ...args,
      beforeFormId: input.beforeFormId,
    });
    return {
      ok: true,
      ...result,
      modelOutput: [
        ...result.forms.map(
          (form) =>
            `Form ${form.formId}, revision ${form.revision} (${form.kind}): ${form.title ?? form.items.map((item) => item.label).join(", ")}`
        ),
        `Next beforeFormId: ${result.nextBeforeFormId ?? "none"}`,
      ].join("\n"),
    };
  }
  if (input.action === "read" || input.action === "present") {
    if (!input.formId) throw new Error("formId is required");
    const { form } = await readCareerForm({
      ...args,
      formId: input.formId,
      revision: input.revision,
    });
    const responses = await readCareerFormResponses({
      ...args,
      formId: form.formId,
    });
    let message: TalentMessageResponse | undefined;
    if (input.action === "present" && args.presentForm) {
      await args.presentForm(form);
    } else if (input.action === "present") {
      const row = await writeForm(args, {
        p_action: "present",
        p_form_id: form.formId,
        p_revision: form.revision,
        p_payload: form,
        p_content: "",
        p_request_id: args.requestId ?? null,
      });
      message = toTalentMessageResponse(row);
      await args.onMessage?.(message);
    }
    return {
      ok: true,
      formId: form.formId,
      revision: form.revision,
      form,
      responses,
      message,
      modelOutput: [
        formatCareerFormForModel(form),
        ...responses.map(
          ({ messageId, response }) =>
            `Response message ${messageId}:\n${formatCareerFormResponseForModel(response)}`
        ),
      ].join("\n\n"),
    };
  }
  if (!input.form) throw new Error("form is required");
  if (args.workId) input.form.relatedRefs = [...(input.form.relatedRefs ?? []).filter(ref => ref.type !== "work" || ref.id !== args.workId), { type: "work", id: args.workId }];
  await assertConversation(args);
  const documents = await assertDocumentOwnership(
    args,
    input.form.items.flatMap((item) => {
      const content = getCareerFormContent(item);
      return typeof content.documentId === "string" ? [content.documentId] : [];
    })
  );
  // Display the owned document revision without rendering an attachment. The
  // selected revision is checked and pinned when the user submits a selection.
  for (const item of input.form.items) {
    const content = getCareerFormContent(item);
    if (typeof content.documentId !== "string") continue;
    if (typeof content.snapshot_id === "string") {
      const { readPinnedAttachmentReference } = await import("../externalOperations/attachments");
      const file = await readPinnedAttachmentReference(args, content.snapshot_id);
      if (file.documentId !== content.documentId || (typeof content.revision === "number" && file.revision !== content.revision))
        throw new Error("Attachment snapshot does not match the selected document revision");
      item.content = { ...content, revision: file.revision, fileName: file.name };
      continue;
    }
    const document = documents.find(row => row.id === content.documentId)!;
    if (typeof content.revision === "number" && content.revision !== document.revision)
      throw new Error("Document revision changed");
    item.content = { ...content, revision: document.revision, fileName: document.file_name };
  }
  if (input.action === "update" && (!input.formId || !input.expectedRevision))
    throw new Error("formId and expectedRevision are required for update");
  const row = await writeForm(args, {
    p_action: input.action,
    p_form_id: input.formId ?? null,
    p_expected_revision: input.expectedRevision ?? null,
    p_payload: args.presentForm
      ? { ...input.form, presentationDeferred: true }
      : input.form,
    p_content: "",
    p_request_id: args.requestId ?? null,
  });
  const form = parseCareerForm(row.payload);
  if (!form) throw new Error("Form write returned invalid payload");
  const message = toTalentMessageResponse(row);
  if (args.presentForm) await args.presentForm(form);
  else await args.onMessage?.(message);
  return {
    ok: true,
    formId: form.formId,
    revision: form.revision,
    form,
    message,
    modelOutput: formatCareerFormForModel(form),
  };
}

function validateResponse(
  form: CareerForm,
  input: {
    itemId?: string;
    actionId?: string;
    message?: string;
    skipped?: boolean;
    values: CareerFormResponse["values"];
  }
) {
  if (input.itemId && !form.items.some((item) => item.id === input.itemId))
    throw new Error("Form item not found");
  if (input.actionId) {
    if (!findCareerFormAction(form, input.actionId, input.itemId))
      throw new Error("Form action not found");
  } else if (
    form.kind !== "suggestion" ||
    !input.itemId ||
    (input.message === undefined && input.skipped !== true)
  ) {
    throw new Error("A saved action or suggestion response is required");
  }
  for (const id of Object.keys(input.values)) {
    if (
      !form.items.some((item) => item.id === id) ||
      (input.itemId && id !== input.itemId)
    )
      throw new Error("Form item not found");
  }
}

export async function respondToCareerForm(args: Scope & { input: unknown }) {
  const input = careerFormResponseInputSchema.parse(args.input);
  const previous = await args.admin.from("talent_messages").select("*")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId).eq("message_type", "career_form_response")
    .eq("payload->>requestId", input.requestId).maybeSingle();
  if (previous.error) throw previous.error;
  if (previous.data) return toTalentMessageResponse(previous.data as TalentMessageRow);
  const { form } = await readCareerForm({
    ...args,
    formId: input.formId,
    revision: input.revision,
  });
  let answers: CareerSuggestionAnswer[] | undefined;
  if (form.kind === "suggestion") {
    if (!input.answers?.length)
      throw new Error(
        "At least one suggestion answer is required"
      );
    if (
      input.itemId ||
      input.actionId ||
      input.message !== undefined ||
      input.skipped !== undefined ||
      Object.keys(input.values).length
    )
      throw new Error("A suggestion batch cannot include a separate response");
    const ids = new Set(input.answers.map((answer) => answer.itemId));
    // Partial answers wake only the linked work; duplicate or foreign IDs are invalid.
    if (
      ids.size !== input.answers.length ||
      input.answers.some(answer => !form.items.some(item => item.id === answer.itemId))
    )
      throw new Error(
        "Each submitted answer must identify a distinct current form item"
      );
    for (const answer of input.answers) validateResponse(form, answer);
    answers = input.answers;
  } else {
    if (input.answers)
      throw new Error(
        "Review forms use a saved action, not a suggestion batch"
      );
    validateResponse(form, input);
  }
  const submitted = answers ?? [input];
  await assertDocumentOwnership(
    args,
    submitted.flatMap((answer) =>
      form.items.flatMap((item) =>
        item.type === "document" &&
        typeof answer.values[item.id] === "string" &&
        answer.values[item.id]
          ? [String(answer.values[item.id])]
          : []
      )
    )
  );
  const response: CareerFormResponse = {
    formId: form.formId,
    revision: form.revision,
    requestId: input.requestId,
    formSnapshot: form,
    ...(answers
      ? { answers, values: {} }
      : {
          ...(input.itemId ? { itemId: input.itemId } : {}),
          ...(input.actionId ? { actionId: input.actionId } : {}),
          ...(input.message !== undefined ? { message: input.message } : {}),
          ...(input.skipped !== undefined ? { skipped: input.skipped } : {}),
          values: input.values,
        }),
  };
  // The submitted selection is pinned independently of later document edits.
  const selectedFiles: NonNullable<CareerFormResponse["selectedFiles"]> = [];
  for (const answer of submitted) for (const item of form.items) {
    const documentId = answer.values[item.id];
    if (item.type !== "document" || typeof documentId !== "string" || !documentId) continue;
    const content = getCareerFormContent(item);
    const { prepareAttachments } = await import("../externalOperations/attachments");
    const [file] = await prepareAttachments({ ...args, requestId: input.requestId }, [{ document_id: documentId,
      ...(documentId === content.documentId && typeof content.revision === "number" ? { revision: content.revision } : {}),
      ...(documentId === content.documentId && typeof content.snapshot_id === "string" ? { snapshot_id: content.snapshot_id } : {}),
    }]);
    if (!file.snapshotId) throw new Error("Selected file could not be pinned");
    selectedFiles.push({ itemId: item.id, documentId, revision: file.revision ?? null, snapshotId: file.snapshotId, fileName: file.name });
  }
  if (selectedFiles.length) response.selectedFiles = selectedFiles;
  const row = await writeForm(args, {
    p_action: "respond",
    p_form_id: form.formId,
    p_revision: form.revision,
    p_payload: response,
    p_content: answers
      ? buildCareerSuggestionResponseMessage(form, answers)
      : buildCareerFormResponseMessage(
          form,
          input.actionId,
          input.values,
          input.itemId,
          input
        ),
    p_request_id: input.requestId,
  });
  return toTalentMessageResponse(row);
}

export async function hideCareerForm(scope: Scope & { formId: number }) {
  return writeForm(scope, { p_action: "hide", p_form_id: scope.formId });
}

/** Persist each presentation before yielding; no in-memory list is the only reader. */
export function createCareerFormPresenter(
  scope: Scope,
  onMessage: (message: TalentMessageResponse) => void | Promise<void>,
  turnId: string
) {
  const pending: CareerForm[] = [];
  const present = async (form: CareerForm) => {
    const row = await writeForm(scope, {
      p_action: "present",
      p_form_id: form.formId,
      p_revision: form.revision,
      p_payload: form,
      p_content: "",
      p_request_id: `presentation:${turnId}:${form.formId}:${form.revision}`,
    });
    await onMessage(toTalentMessageResponse(row));
  };
  return {
    hasPending: () => pending.length > 0,
    presentForm: async (form: CareerForm) => {
      await present(form);
      pending.push(form);
    },
    flush: async () => {
      pending.length = 0;
    },
  };
}
