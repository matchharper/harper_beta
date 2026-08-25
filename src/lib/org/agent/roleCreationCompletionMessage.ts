function displayText(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).replace(
    /([\\`*_{}\[\]<>()#+\-.!|])/g,
    "\\$1"
  );
}

export function buildRoleCreationCompletionMessage(args: {
  companyName?: string | null;
  roleName?: string | null;
  slackNotificationDelivered?: boolean | null;
  surface?: "chat" | "slack";
  userName?: string | null;
}) {
  const companyName = displayText(args.companyName, "회사");
  const roleName = displayText(args.roleName, "새 역할");
  const slackDeliveryNote =
    args.slackNotificationDelivered === true
      ? "선택한 Slack 채널에도 역할 등록과 후보자 탐색 시작을 알렸어요."
      : args.slackNotificationDelivered === false
        ? "Slack에는 등록 안내를 보내지 못했어요. 역할 등록과 후보자 탐색은 정상적으로 시작됐어요. Slack 연결과 알림 채널을 확인해 주세요."
        : "";

  const emphasizedRoleName =
    args.surface === "slack" ? `*${roleName}*` : `**${roleName}**`;
  const deliveryParagraph = slackDeliveryNote ? `\n\n${slackDeliveryNote}` : "";
  return `지금부터 ${companyName}의 ${emphasizedRoleName} 역할의 매칭을 시작합니다.${deliveryParagraph}

🔥 앞으로 Harper가 해당 역할의 기준과 팀의 선호도에 맞는 후보자를 찾아 추천할게요.

추천되는 후보자는 단순히 기준에 맞는 사람을 찾아 알려드리는 게 아니에요. 이 정보를 바탕으로 Harper 인재풀을 검토하고, 부족한 정보가 있다면 후보자에게 먼저 확인해요. 적합한 분을 발견하면 ${companyName}와 역할을 충분히 소개하고, 왜 좋은 기회가 될 수 있는지 설명한 뒤 ${companyName}와 대화해 보고 싶다고 답한 분들만 알려드려요.

따라서 당장 대량의 연결 제안을 드리기 보다는, 천천히 정말 적합한 분들만을 연결해드릴게요.

이후 Inbox의 연결 대기 후보자를 검토하고 연결을 수락하거나 거절하면 그 결정에 따라 다음 단계를 진행해요. 연결을 수락하면 소개 이메일로 양측을 연결하고, 연결을 거절하면 회사가 더 진행하지 않기로 했다는 종료 결정이 후보자에게 안내돼요.

그 과정에서나 평소에도 어떤 점을 선호하시는지, 특정 후보자가 왜 기준에 맞지 않았는지 자세히 알려주실수록 다음 매칭에 더 정확하게 반영할 수 있어요. 기준이 달라진다면 편하게 알려주세요.

감사합니다.`;
}

export function splitRoleCreationCompletionSentences(content: string) {
  const chunks: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (!".!?".includes(content[index])) continue;
    const next = content[index + 1];
    if (next && !/\s/.test(next)) continue;

    let end = index + 1;
    while (end < content.length && /\s/.test(content[end])) end += 1;
    chunks.push(content.slice(start, end));
    start = end;
    index = end - 1;
  }

  if (start < content.length) chunks.push(content.slice(start));
  return chunks.filter(Boolean);
}
