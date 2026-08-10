import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const clean = (value: unknown) => String(value ?? "").trim();

async function slackApi<T>(
  token: string,
  method: string,
  payload: Record<string, string> = {}
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    body: new URLSearchParams(payload),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    method: "POST",
  });
  const result = (await response.json()) as T & {
    error?: string;
    ok?: boolean;
  };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Slack API ${method} failed`);
  }
  return result;
}

function sourceMessageIdFromArgs() {
  const index = process.argv.indexOf("--source-message-id");
  if (index < 0) return null;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("--source-message-id must be a positive integer");
  }
  return parsed;
}

async function main() {
  const token = clean(process.env.SLACK_HARPER_LOCAL_BOT_TOKEN);
  const channelId = clean(process.env.HARPER_SLACK_LOCAL_TEST_CHANNEL_ID);
  if (!token.startsWith("xoxb-")) {
    throw new Error("SLACK_HARPER_LOCAL_BOT_TOKEN is required");
  }
  if (!channelId) {
    throw new Error("HARPER_SLACK_LOCAL_TEST_CHANNEL_ID is required");
  }

  const admin = getSupabaseAdmin();
  let sourceQuery = (admin.from("company_messages" as any) as any)
    .select("id, company_workspace_id, metadata")
    .eq("message_type", "slack")
    .eq("role", "assistant")
    .contains("metadata", { source: "codex_scheduled_auto_intro_to_company" })
    .order("created_at", { ascending: false })
    .limit(1);
  const requestedSourceMessageId = sourceMessageIdFromArgs();
  if (requestedSourceMessageId) {
    sourceQuery = sourceQuery.eq("id", requestedSourceMessageId);
  }
  const { data: sourceData, error: sourceError } = await sourceQuery;
  if (sourceError) throw sourceError;
  const source = sourceData?.[0];
  if (!source) throw new Error("검토할 자동 소개 Slack 기록이 없습니다.");

  const [{ data: channel, error: channelError }, auth] = await Promise.all([
    (admin.from("company_slack_channels" as any) as any)
      .select("slack_team_id, is_private")
      .eq("company_workspace_id", clean(source.company_workspace_id))
      .eq("slack_channel_id", channelId)
      .eq("is_enabled", true)
      .maybeSingle(),
    slackApi<any>(token, "auth.test"),
  ]);
  if (channelError) throw channelError;
  if (!channel) {
    throw new Error("선택한 채널은 source workspace의 활성 채널이 아닙니다.");
  }
  if (clean(channel.slack_team_id) !== clean(auth.team_id)) {
    throw new Error("개발 App과 source workspace의 Slack team이 다릅니다.");
  }
  if (!channel.is_private) {
    await slackApi(token, "conversations.join", { channel: channelId });
  }

  const posted = await slackApi<any>(token, "chat.postMessage", {
    blocks: JSON.stringify([
      {
        text: {
          text: "*Harper 로컬 후보자 검토 테스트*\n실제 후보자 데이터와 실제 Slack 모달을 사용하지만 수락·거절 확인을 완료해도 상태 변경이나 메일 발송은 일어나지 않습니다.",
          type: "mrkdwn",
        },
        type: "section",
      },
      {
        elements: [
          {
            action_id: "harper_talent_review:open",
            style: "primary",
            text: { text: "후보자 검토하기", type: "plain_text" },
            type: "button",
            value: `local_source:${source.id}`,
          },
        ],
        type: "actions",
      },
    ]),
    channel: channelId,
    text: "Harper 로컬 후보자 검토 테스트",
  });

  console.log(
    JSON.stringify({
      channelId,
      messageTs: clean(posted.ts),
      sourceMessageId: Number(source.id),
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
