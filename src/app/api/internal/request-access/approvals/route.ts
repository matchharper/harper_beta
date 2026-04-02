import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getRequestAccessBaseUrl,
  parseRequestAccessReviewToken,
  sendRequestAccessApprovalEmail,
} from "@/lib/requestAccess/server";
import type {
  RequestAccessApprovalEmailLocale,
  RequestAccessBulkApprovalResponse,
  RequestAccessBulkApprovalResult,
} from "@/lib/requestAccess/types";

export const runtime = "nodejs";

type Body = {
  request?: string[];
  requests?: string[];
  locale?: RequestAccessApprovalEmailLocale;
  from?: string;
  subject?: string;
  html?: string;
};

function normalizeRequests(body: Body) {
  const raw = Array.isArray(body.requests)
    ? body.requests
    : Array.isArray(body.request)
      ? body.request
      : [];

  return Array.from(
    new Set(
      raw
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
    )
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const requests = normalizeRequests(body);

    if (requests.length === 0) {
      return NextResponse.json(
        { error: "At least one request token is required" },
        { status: 400 }
      );
    }

    const baseUrl = getRequestAccessBaseUrl(req);
    const locale = body.locale === "ko" ? "ko" : "en";
    const from = String(body.from ?? "");
    const subject = String(body.subject ?? "").trim();
    const html = String(body.html ?? "").trim();

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }
    if (!html) {
      return NextResponse.json(
        { error: "HTML body is required" },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      requests.map(
        async (request): Promise<RequestAccessBulkApprovalResult> => {
          let email = "";

          try {
            email = parseRequestAccessReviewToken(request);
            const result = await sendRequestAccessApprovalEmail({
              email,
              approvedBy: user.email ?? "unknown@matchharper.com",
              baseUrl,
              locale,
              from,
              subject,
              html,
            });

            return {
              email: result.email,
              status: result.status,
            };
          } catch (error) {
            return {
              email: email || request,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to send approval email",
              status: "failed",
            };
          }
        }
      )
    );

    const response = results.reduce<RequestAccessBulkApprovalResponse>(
      (acc, result) => {
        acc.results.push(result);
        acc.counts.total += 1;

        if (result.status === "approved") {
          acc.counts.approved += 1;
        } else if (result.status === "already_granted") {
          acc.counts.alreadyGranted += 1;
        } else {
          acc.counts.failed += 1;
          acc.ok = false;
        }

        return acc;
      },
      {
        counts: {
          alreadyGranted: 0,
          approved: 0,
          failed: 0,
          total: 0,
        },
        ok: true,
        results: [],
      }
    );

    return NextResponse.json(response);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to send bulk request access approval emails"
    );
  }
}
