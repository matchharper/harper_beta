import { NextRequest, NextResponse } from "next/server";
import {
  buildHarperSlackCallbackPath,
  completeHarperSlackOAuth,
  readHarperSlackStateReturnTo,
} from "@/lib/org/slackHarper";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const slackError = req.nextUrl.searchParams.get("error");
  let returnTo = "/org";

  try {
    returnTo = readHarperSlackStateReturnTo(state);
    if (slackError) {
      return NextResponse.redirect(
        new URL(
          buildHarperSlackCallbackPath({
            error:
              slackError === "access_denied"
                ? "Slack 연결이 취소되었습니다."
                : "Slack 연결을 완료하지 못했습니다.",
            result: "error",
            returnTo,
          }),
          req.nextUrl.origin
        )
      );
    }

    const completedReturnTo = await completeHarperSlackOAuth({
      code,
      origin: req.nextUrl.origin,
      state,
    });
    return NextResponse.redirect(
      new URL(
        buildHarperSlackCallbackPath({
          result: "connected",
          returnTo: completedReturnTo,
        }),
        req.nextUrl.origin
      )
    );
  } catch (error) {
    console.error("[org/slack/callback]", error);
    return NextResponse.redirect(
      new URL(
        buildHarperSlackCallbackPath({
          error: "Slack 연결에 실패했습니다. 다시 시도해 주세요.",
          result: "error",
          returnTo,
        }),
        req.nextUrl.origin
      )
    );
  }
}
