import { NextRequest, NextResponse } from "next/server";
import {
  renewGtmOutreachGmailWatch,
  syncGtmOutreachGmailHistory,
  verifyCronSecret,
} from "@/lib/contentsEngine/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const watch = await renewGtmOutreachGmailWatch();
    const sync = await syncGtmOutreachGmailHistory(watch.historyId);
    return NextResponse.json({ ok: true, sync, watch });
  } catch (error) {
    console.error("[contents-engine/gmail/watch]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to renew Gmail watch",
      },
      { status: 500 }
    );
  }
}
