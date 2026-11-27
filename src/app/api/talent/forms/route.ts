import { respondToCareerForms } from "@/lib/career/forms/batch";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { careerFormBatchInputSchema, careerFormResponseInputSchema } from "@/lib/career/forms/schema";
import {
  listCareerForms,
  readCareerForm,
  readCareerFormResponses,
  respondToCareerForm,
} from "@/lib/career/forms/server";
import { classifyFormResponseError, failedPdfExport } from "@/lib/career/forms/responseError";
import { recordPdfExport } from "@/lib/documents/pdfDiagnostics";
import { formatToolError } from "@/lib/llm/toolError";

const readInput = z.object({
  conversationId: z.string().uuid(),
  formId: z.coerce.number().int().positive().optional(),
  revision: z.coerce.number().int().positive().optional(),
  beforeFormId: z.coerce.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = readInput.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const scope = {
    admin: getTalentSupabaseAdmin(),
    userId: user.id,
    conversationId: parsed.data.conversationId,
  };
  try {
    if (!parsed.data.formId)
      return NextResponse.json(
        await listCareerForms({
          ...scope,
          beforeFormId: parsed.data.beforeFormId,
        })
      );
    const { form } = await readCareerForm({
      ...scope,
      formId: parsed.data.formId,
      revision: parsed.data.revision,
    });
    const responses = await readCareerFormResponses({
      ...scope,
      formId: form.formId,
    });
    return NextResponse.json({ form, responses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read form" },
      { status: 404 }
    );
  }
}

// The client shows a reason for the code. The error text stays in the server log, and a PDF that could not be made
// is also kept in the export log that ops and Harper's document tools read.
async function refuse(error: unknown, userId: string) {
  const { status, code, retryable } = classifyFormResponseError(error);
  console.error("[CareerForms] form response not saved", { code, error: formatToolError(error) });
  const pdf = failedPdfExport(error);
  if (pdf) await recordPdfExport({ admin: getTalentSupabaseAdmin(), userId, ...pdf, outcome: "failed" });
  return NextResponse.json({ code, retryable }, { status });
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => null);
  const batch = Boolean(raw && Array.isArray(raw.responses));
  const parsed = (batch ? careerFormBatchInputSchema : careerFormResponseInputSchema).safeParse(raw);
  if (!parsed.success) return refuse(parsed.error, user.id);
  try {
    const message = await (batch ? respondToCareerForms : respondToCareerForm)({
      admin: getTalentSupabaseAdmin(),
      userId: user.id,
      conversationId: parsed.data.conversationId,
      input: parsed.data,
    });
    after(async () => {
      const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
      await publishCareerInvocations({ admin: getTalentSupabaseAdmin(), userId: user.id, conversationId: parsed.data.conversationId });
    });
    return NextResponse.json({ message });
  } catch (error) {
    return refuse(error, user.id);
  }
}
