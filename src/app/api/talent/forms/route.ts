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

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => null);
  const batch = Boolean(raw && Array.isArray(raw.responses));
  const parsed = (batch ? careerFormBatchInputSchema : careerFormResponseInputSchema).safeParse(raw);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save form response",
      },
      { status: 400 }
    );
  }
}
