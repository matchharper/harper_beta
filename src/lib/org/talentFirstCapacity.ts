export const TALENT_FIRST_CAPACITY_NOTICE = {
  ko: "현재 연결 수락한 후보가 많아 추가적으로 후보자에게 먼저 추천하지 않고 있습니다. 진행을 원하시면 연결 수락 혹은 거절을 통해 각 후보자에 대해 피드백 해주세요.",
  en: "There are many candidates waiting to connect, so we are not recommending this role to additional candidates first. To continue, please accept or decline each pending connection.",
} as const;

export function hasReachedTalentFirstCapacity(
  pendingCount: number,
  maxPendingTalents: number | null | undefined
) {
  return maxPendingTalents != null && pendingCount >= maxPendingTalents;
}
