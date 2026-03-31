import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  approveRequestAccess,
  getRequestAccessBaseUrl,
  REQUEST_ACCESS_APPROVE_ACTION_ID,
} from "@/lib/requestAccess/server";

export const runtime = "nodejs";

function getSlackSigningSecret() {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    throw new Error("SLACK_SIGNING_SECRET is not configured");
  }
  return signingSecret;
}

function verifySlackSignature(args: {
  rawBody: string;
  timestamp: string;
  signature: string;
}) {
  const signingSecret = getSlackSigningSecret();
  const now = Math.floor(Date.now() / 1000);
  const requestTs = Number(args.timestamp);

  if (!Number.isFinite(requestTs) || Math.abs(now - requestTs) > 60 * 5) {
    return false;
  }

  const base = `v0:${args.timestamp}:${args.rawBody}`;
  const computed =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(base).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(args.signature)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-slack-signature") ??
      req.headers.get("X-Slack-Signature") ??
      "";
    const timestamp =
      req.headers.get("x-slack-request-timestamp") ??
      req.headers.get("X-Slack-Request-Timestamp") ??
      "";

    if (!verifySlackSignature({ rawBody, signature, timestamp })) {
      console.warn("[slack-interactivity] invalid signature");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payloadText = new URLSearchParams(rawBody).get("payload");
    if (!payloadText) {
      console.warn("[slack-interactivity] missing payload");
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadText) as {
      user?: { id?: string };
      actions?: Array<{ action_id?: string; value?: string }>;
    };
    const action = payload.actions?.[0];

    if (action?.action_id !== REQUEST_ACCESS_APPROVE_ACTION_ID) {
      return NextResponse.json(
        {
          response_type: "ephemeral",
          text: "Unsupported action",
        },
        { status: 200 }
      );
    }

    const actionValue = JSON.parse(String(action.value ?? "{}")) as {
      email?: string;
    };
    const email = String(actionValue?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      throw new Error("Missing request email");
    }

    const result = await approveRequestAccess({
      email,
      approvedBy: String(payload.user?.id ?? "unknown"),
      baseUrl: getRequestAccessBaseUrl(req),
    });

    const text =
      result.status === "already_granted"
        ? `Access already granted for ${result.email}.`
        : `Approval email sent to ${result.email}.`;

    return NextResponse.json(
      {
        response_type: "ephemeral",
        text,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[slack-interactivity] fatal", error);
    return NextResponse.json(
      {
        response_type: "ephemeral",
        text:
          error instanceof Error
            ? error.message
            : "Failed to approve request access",
      },
      { status: 200 }
    );
  }
}
