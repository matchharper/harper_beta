import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type { OpsCompanyAnswerExampleDebugInput } from "@/lib/ops/companyAnswerExampleDebugger";
import {
  OpsCompanyAnswerExampleDebugInputError,
  runOpsCompanyAnswerExampleDebug,
} from "@/lib/ops/companyAnswerExampleDebuggerServer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req
      .json()
      .catch(() => ({}))) as OpsCompanyAnswerExampleDebugInput;
    return NextResponse.json(await runOpsCompanyAnswerExampleDebug(body));
  } catch (error) {
    if (error instanceof OpsCompanyAnswerExampleDebugInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toInternalApiErrorResponse(
      error,
      "Failed to run company answer example retrieval"
    );
  }
}
