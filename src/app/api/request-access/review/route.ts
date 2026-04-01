import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_EMAIL_DOMAIN, isInternalEmail } from "@/lib/internalAccess";
import {
  getRequestAccessBaseUrl,
  parseRequestAccessReviewToken,
  prepareRequestAccessApprovalDraft,
  sendRequestAccessApprovalEmail,
} from "@/lib/requestAccess/server";
import type { RequestAccessApprovalEmailLocale } from "@/lib/requestAccess/types";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type ReviewRequestBody = {
  request?: string;
  locale?: RequestAccessApprovalEmailLocale;
  from?: string;
  subject?: string;
  html?: string;
};

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message === "Invalid request access review token" ||
    message === "Request access row not found"
  ) {
    return 404;
  }

  return 500;
}

function forbidden() {
  return NextResponse.json(
    { error: `Forbidden: ${INTERNAL_EMAIL_DOMAIN} email required` },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isInternalEmail(user.email)) {
    return forbidden();
  }

  const request = String(req.nextUrl.searchParams.get("request") ?? "").trim();
  if (!request) {
    return NextResponse.json({ error: "Missing request" }, { status: 400 });
  }

  try {
    const draft = await prepareRequestAccessApprovalDraft({
      request,
      baseUrl: getRequestAccessBaseUrl(req),
    });

    return NextResponse.json(draft, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load request access draft",
      },
      { status: getErrorStatus(error) }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isInternalEmail(user.email)) {
    return forbidden();
  }

  let body: ReviewRequestBody;
  try {
    body = (await req.json()) as ReviewRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const request = String(body?.request ?? "").trim();
  if (!request) {
    return NextResponse.json({ error: "Missing request" }, { status: 400 });
  }

  try {
    const email = parseRequestAccessReviewToken(request);
    const result = await sendRequestAccessApprovalEmail({
      email,
      approvedBy: "request_access_review_link",
      baseUrl: getRequestAccessBaseUrl(req),
      locale: body?.locale,
      from: String(body?.from ?? ""),
      subject: String(body?.subject ?? ""),
      html: String(body?.html ?? ""),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send request access email",
      },
      { status: getErrorStatus(error) }
    );
  }
}
