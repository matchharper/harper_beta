import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  deleteOpsAnswerExample,
  fetchOpsAnswerExamples,
  saveOpsAnswerExample,
} from "@/lib/opsAnswerExamplesServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsAnswerExamples({
      query: req.nextUrl.searchParams.get("query"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load answer examples");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const payload = await saveOpsAnswerExample({
      actorEmail: user.email,
      input: body,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save answer example");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const payload = await saveOpsAnswerExample({
      actorEmail: user.email,
      input: body,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update answer example");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
    const payload = await deleteOpsAnswerExample({ id });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete answer example");
  }
}
