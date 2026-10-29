import { callAnswersQuery } from "@/lib/career/internalCallAnswersDatabase.server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser } from "@/lib/supabaseServer";
import { readInternalCallQuestions } from "@/lib/career/internalCallAnswersStore";

function errorResponse(error: unknown) {
  const status =
    error instanceof z.ZodError
      ? 400
      : Number((error as { status?: number })?.status) || 500;
  if (status === 500) console.error("[internal-call-answers]", error);
  return NextResponse.json(
    {
      error:
        status === 500
          ? "Unable to save answers. Please retry."
          : error instanceof Error
            ? error.message
            : "Invalid request",
    },
    { status }
  );
}
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const callId = z
      .string()
      .uuid()
      .parse(req.nextUrl.searchParams.get("callId"));
    return NextResponse.json({
      call: await readInternalCallQuestions(
        callAnswersQuery(),
        callId,
        user.id
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
