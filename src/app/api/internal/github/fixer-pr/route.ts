import { NextResponse } from "next/server";
import { handleFixerPrWebhook } from "@/lib/ops/fixerPrSlack.server";

export const runtime = "nodejs";

/** GitHub `pull_request` webhook (harper_beta, harper_worker) for the incident fixer's PR cards in Slack #qa. */
export async function POST(req: Request) {
  const result = await handleFixerPrWebhook({
    event: req.headers.get("x-github-event"),
    rawBody: await req.text(),
    signature: req.headers.get("x-hub-signature-256"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
