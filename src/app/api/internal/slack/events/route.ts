import { after, NextRequest, NextResponse } from "next/server";
import {
  isHarperSlackAppId,
  verifyHarperSlackSignature,
} from "@/lib/org/slackHarper";
import { publishHarperSlackEvent } from "@/lib/org/slackTurnQueue";
import {
  candidateIdFromSlackEntity,
  presentSlackCandidate,
  refreshSlackCandidateUnfurls,
} from "@/lib/org/slackCandidateWorkObject.server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  if (!verifyHarperSlackSignature(rawBody, timestamp, signature))
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody) as Record<string, any>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.type === "url_verification")
    return NextResponse.json({ challenge: body.challenge });
  if (!isHarperSlackAppId(body.api_app_id))
    return NextResponse.json({ error: "wrong_app" }, { status: 403 });

  if (
    ["entity_details_requested", "link_shared"].includes(body.event?.type) &&
    process.env.HARPER_LOCAL_E2E === "1" &&
    (body.api_app_id !== process.env.SLACK_HARPER_LOCAL_APP_ID ||
      body.event?.channel !== process.env.HARPER_LOCAL_ONLY_CHANNEL_ID)
  ) {
    return NextResponse.json({ ignored: true });
  }
  if (body.event?.type === "link_shared") {
    after(() =>
      refreshSlackCandidateUnfurls(body).catch((error) =>
        console.error("[harper-slack/candidate-unfurl]", error)
      )
    );
    return NextResponse.json({ ok: true });
  }
  if (body.event?.type === "entity_details_requested") {
    const event = body.event;
    const candidateId = candidateIdFromSlackEntity(event);
    if (candidateId && event.trigger_id && event.user && body.team_id) {
      // The user trigger is short lived; details must bypass the conversation queue.
      after(() =>
        presentSlackCandidate({
          candidateId,
          triggerId: event.trigger_id,
          slackUserId: event.user,
          slackTeamId: body.team_id,
          channelId: event.channel,
        }).catch((error) =>
          console.error("[harper-slack/entity-details]", error)
        )
      );
    }
    return NextResponse.json({ ok: true });
  }

  try {
    await publishHarperSlackEvent(body);
  } catch (error) {
    console.error("[harper-slack/events:publish]", error);
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
