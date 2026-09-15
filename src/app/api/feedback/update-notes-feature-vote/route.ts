import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { postUserFeedbackSlackMessage } from "@/lib/userFeedbackSlack";
import {
  formatUpdateNotesFeatureVoteSlackText,
  isUpdateNotesFeatureVoteOptionId,
  normalizeUpdateNotesFeatureVoteContext,
  normalizeUpdateNotesFeatureVoteCustomResponse,
  normalizeUpdateNotesFeatureVoteOptionIds,
  UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH,
  UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH,
} from "@/lib/updateNotesFeatureVote";

export const runtime = "nodejs";

type UpdateNotesFeatureVoteBody = {
  context?: unknown;
  customResponse?: unknown;
  optionIds?: unknown;
  revision?: unknown;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateNotesFeatureVoteBody;
  try {
    body = (await req.json()) as UpdateNotesFeatureVoteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !Array.isArray(body.optionIds) ||
    body.optionIds.some(
      (optionId) => !isUpdateNotesFeatureVoteOptionId(optionId)
    )
  ) {
    return NextResponse.json(
      { error: "Invalid feature selections" },
      { status: 400 }
    );
  }

  const optionIds = normalizeUpdateNotesFeatureVoteOptionIds(body.optionIds);
  if (optionIds.length !== body.optionIds.length) {
    return NextResponse.json(
      { error: "Duplicate feature selections are not allowed" },
      { status: 400 }
    );
  }

  if (
    body.context !== undefined &&
    (typeof body.context !== "string" ||
      body.context.length > UPDATE_NOTES_FEATURE_VOTE_CONTEXT_MAX_LENGTH)
  ) {
    return NextResponse.json(
      { error: "Invalid feature vote context" },
      { status: 400 }
    );
  }

  if (
    body.customResponse !== undefined &&
    (typeof body.customResponse !== "string" ||
      body.customResponse.length >
        UPDATE_NOTES_FEATURE_VOTE_CUSTOM_RESPONSE_MAX_LENGTH)
  ) {
    return NextResponse.json(
      { error: "Invalid feature vote custom response" },
      { status: 400 }
    );
  }

  if (body.revision !== undefined && typeof body.revision !== "boolean") {
    return NextResponse.json(
      { error: "Invalid feature vote revision state" },
      { status: 400 }
    );
  }

  const customResponse = normalizeUpdateNotesFeatureVoteCustomResponse(
    body.customResponse
  );
  if (optionIds.length === 0 && !customResponse) {
    return NextResponse.json(
      { error: "Select a feature or write a custom response" },
      { status: 400 }
    );
  }
  const context =
    optionIds.length > 0
      ? normalizeUpdateNotesFeatureVoteContext(body.context)
      : "";

  try {
    await postUserFeedbackSlackMessage({
      text: formatUpdateNotesFeatureVoteSlackText({
        context,
        customResponse,
        email: user.email,
        optionIds,
        revision: body.revision === true,
      }),
    });
  } catch (error) {
    console.error("update notes feature vote Slack delivery failed:", error);
    return NextResponse.json(
      { error: "Failed to deliver feature vote" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
