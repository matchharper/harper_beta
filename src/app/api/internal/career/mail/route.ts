import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCareerTalentMailHistory,
  parseCareerMailHistoryLimit,
  parseCareerMailHistoryOffset,
  sendCareerTalentMailAndRecord,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

type Body = {
  content?: string;
  fromEmail?: string;
  subject?: string;
  userId?: string;
};

function isValidEmail(value: string) {
  const normalized = value.trim();
  return (
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(normalized) ||
    /^.{1,80}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(normalized)
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const history = await fetchCareerTalentMailHistory({
      limit: parseCareerMailHistoryLimit(req.nextUrl.searchParams.get("limit")),
      offset: parseCareerMailHistoryOffset(
        req.nextUrl.searchParams.get("offset")
      ),
      userId,
    });

    return NextResponse.json(history);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load career talent email history"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const userId = String(body.userId ?? "").trim();
    const fromEmail = String(body.fromEmail ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    if (!isValidEmail(fromEmail)) {
      return NextResponse.json(
        { error: "A valid sender email is required" },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }
    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const result = await sendCareerTalentMailAndRecord({
      content,
      createdBy: user.email ?? "unknown@matchharper.com",
      fromEmail,
      subject,
      userId,
    });

    return NextResponse.json({
      ok: true,
      historyId: result.historyId,
      recipientEmail: result.recipientEmail,
      recipientName: result.recipientName,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to send career talent email"
    );
  }
}
