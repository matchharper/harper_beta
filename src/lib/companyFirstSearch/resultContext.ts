import type { CandidateOutreachPause } from "./history";

type ResultRole = {
  automaticSearchEnabled: boolean;
  id: string;
  introSearchDate?: string[];
  introSearchTime?: number;
  name: string;
  request?: string | null;
  salary?: string | null;
};

type ResultCandidate = {
  candidateRequestedReview?: boolean;
  headline: string | null;
  name: string;
  profileUrl: string;
  reason: string;
  roleId: string;
  roleName: string;
  summary: string | null;
  tldr?: string | null;
  harperNote?: string | null;
};

export type CompanyMatchingResultContextInput = {
  candidates: ResultCandidate[];
  firstDelivery?: boolean;
  roles: ResultRole[];
  runStatus: string;
  candidateOutreachPauses?: CandidateOutreachPause[];
  requestedByCompany?: boolean;
};

export function buildCompanyMatchingResultContext(
  input: CompanyMatchingResultContextInput
) {
  const selected = input.candidates.length;
  const succeeded = input.runStatus === "succeeded";
  const roleNames =
    input.roles
      .map((role) => role.name)
      .filter(Boolean)
      .join(", ") || "부탁받은 채용";
  const lines = [
    input.requestedByCompany === false
      ? `- ${roleNames} 채용의 정기 매칭 확인 결과다. 회사가 새 검색을 직접 요청한 결과는 아니다.`
      : `- Harper가 ${roleNames} 채용에 관해 앞서 부탁받은 확인을 마쳤다.`,
    ...(succeeded
      ? selected > 0
        ? [
            "- 지금 회사에 소개해도 좋겠다고 판단한 사람들이 아래에 있다.",
            "- 일반 선제 제안은 후보자의 관심을 아직 확인하지 않았다. 본인이 우선 검토를 요청한 사람은 아래에 그 사실이 표시된다. 어느 쪽도 역할 수락이나 연결 완료를 의미하지 않는다. 회사가 만나 보고 싶은 사람을 고르면 Harper가 본인에게 역할 수락 의사를 묻는다.",
          ]
        : [
            "- 지금 Harper가 알고 있는 사람들 가운데 회사가 찾는 사람에 비춰 바로 소개해도 좋겠다고 확신할 만한 사람은 고르지 못했다.",
            "- 이 채용에 잘 맞는 사람이 전혀 없다는 뜻은 아니다. 확신이 부족한 사람을 숫자를 채우기 위해 소개하지 않았다는 뜻이다.",
            "- 사람에 따라 자신의 프로필이 회사에 먼저 전달되기보다 본인이 회사를 먼저 보고 대화할지 정하길 원하기도 한다. 그런 사람은 지금 회사에 바로 보여 줄 수 없지만, 충분히 잘 맞는다면 Harper가 회사를 먼저 소개하고 동의를 받은 뒤 연결할 수 있다.",
          ]
      : input.runStatus === "skipped"
        ? [
            "- 현재 회사 또는 Role 상태 때문에 부탁받은 일을 진행하지 못했다.",
            "- 사람을 검토한 뒤 적합한 사람이 없었다는 의미는 아니다.",
          ]
        : [
            "- 부탁받은 일을 끝까지 마치지 못했다.",
            "- 적합한 사람이 없었다거나 누군가에게 연락했다는 의미는 아니다.",
          ]),
    ...(succeeded && input.roles.some((role) => role.automaticSearchEnabled)
      ? [
          ...input.roles.filter((role) => role.automaticSearchEnabled).map((role) =>
            `- ${role.name}의 정기 후보 검색 설정: ${(role.introSearchDate ?? ["Mon", "Wed", "Fri"]).join(", ")} ${String(role.introSearchTime ?? 9).padStart(2, "0")}:00 Asia/Seoul. 이 시간에 검색을 시작하며 후보자 전달 시점이나 결과를 보장하지 않는다.`
          ),
        ]
      : []),
    ...(succeeded && input.firstDelivery
      ? [
          "- 이 결과는 이 회사에 전달하는 첫 후보 검색 결과다. 여기 나온 사람을 회사가 먼저 제안할지는 선택할 수 있다. Harper가 후보자에게 먼저 역할을 소개하고 의사를 확인하는 별도 추천 경로도 있다. 후보자 동의나 실제 회사 연결이 완료된 것은 아니다.",
          ...input.roles.map((role) =>
            `- ${role.name}의 확인된 보상 범위: ${role.salary?.trim() || "아직 확인되지 않음"}; 현재 채용 요청·인재 기준: ${role.request?.trim() || "아직 확인되지 않음"}`
          ),
        ]
      : []),
  ];

  for (const pause of input.candidateOutreachPauses ?? []) {
    const role = input.roles.find(role => role.id === pause.roleId);
    if (!role) continue;
    lines.push(`- ${role.name}: 이번 확인 당시 연결 대기 ${pause.pendingCount}명, 후보자에게 먼저 제안하는 경로의 상한 ${pause.maxPendingTalents}명. 상한 이상이므로 이번에는 후보자에게 먼저 역할을 추천하는 경로를 진행하지 않았다. 이 제한은 회사에 먼저 후보를 제안하는 검토에는 적용하지 않는다. 검색·fit 평가 전체를 하지 않았다는 뜻은 아니다. Role-based 검색의 새 후보자 선추천은 연결 대기가 상한 미만일 때만 허용하며 상한과 같아도 중단된다. 온보딩 추천이나 이미 선정된 역할의 전달을 추가로 막는 기준은 아니다.`);
  }

  if (selected > 0) {
    lines.push("");
    for (const candidate of input.candidates) {
      lines.push(
        `- [${candidate.name}](${candidate.profileUrl}) · ${candidate.roleName}`,
        `  - ${candidate.headline || "공개 headline 없음"}`,
        `  - ${candidate.tldr || candidate.summary || "공개 가능한 경력 요약 없음"}`,
        candidate.harperNote
          ? `  - Harper Note: ${candidate.harperNote}`
          : `  - 이 회사와 잘 맞을 수 있다고 본 이유: ${candidate.reason}`
      );
      if (candidate.candidateRequestedReview) {
        lines.push("  - 후보자 본인이 이 역할의 우선 검토를 요청했다. 이 사실을 소개할 때 가볍게 함께 알릴 수 있다. 역할 수락이나 회사의 Intro 요청은 아니다.");
      }
    }
  }
  return lines.join("\n");
}
