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
  userName?: string | null;
}) {
  const companyName = displayText(args.companyName, "회사");
  const roleName = displayText(args.roleName, "새 역할");
  const userName = displayText(args.userName, "담당자");

  return `${userName}님, ${companyName}의 **${roleName}** 역할 등록이 완료됐어요. 이제 Harper는 지금까지 함께 정리한 역할 설명과 회사의 맥락, 꼭 필요한 역량과 선호 기준을 바탕으로 후보자 풀과 새로 만나는 인재를 계속 살펴볼게요. 단순히 이력서의 키워드가 비슷한 사람을 고르는 데 그치지 않고, 이 역할에서 기대하는 실제 성과와 일하는 환경, 후보자가 쌓아온 경험과 다음 커리어 방향까지 함께 보며 서로 대화해볼 이유가 분명한 분을 찾겠습니다.

적합도가 높은 인재를 발견하면 Harper가 먼저 역할과 회사의 매력을 정확하게 설명하고, 후보자의 관심과 연결 의사를 확인합니다. 후보자가 제안을 수락하더라도 곧바로 회사에 공유하지 않고, Harper 팀이 현재 상황과 양쪽의 기대가 맞는지 마지막으로 확인한 뒤 연결 대기 단계로 전달할게요. 확인을 마친 인재가 도착하면 등록한 Slack 채널과 담당자에게 알려드리고, 왜 이 역할과 잘 맞는지와 함께 검토할 수 있도록 정리해드리겠습니다.

이제 ${userName}님이 해주실 일은 간단해요. 새로운 인재가 도착하면 프로필과 Harper의 설명을 살펴보고 진행할지, 이번에는 진행하지 않을지 명확하게 알려주세요. 답이 없는 제안을 Harper가 임의로 수락이나 거절로 판단하지 않기 때문에, 팀의 결정이 있을 때만 다음 단계로 이어집니다. 역할의 우선순위나 기준이 달라지거나 더 중요하게 보고 싶은 조건이 생기면 언제든 이 대화에서 알려주세요. 팀의 피드백이 쌓일수록 ${companyName}이 **${roleName}** 역할에서 정말 중요하게 보는 지점을 더 정확히 반영해, 조건만 비슷한 사람이 아니라 함께 일할 가능성을 진지하게 확인해볼 만한 좋은 인재를 연결하겠습니다.`;
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
