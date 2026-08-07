function markerDisplayName(value: unknown) {
  return (
    String(value ?? "")
      .replace(/[\[\]\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "후보자"
  );
}

export function buildReadTalentResponseGuide(args: {
  name: unknown;
  talentId: string;
}) {
  const candidateReference = `[${markerDisplayName(args.name)}](talent:${args.talentId.trim()})`;
  return {
    candidateReference,
    instruction:
      "이 특정 후보자에 대해 답변할 때 이름은 항상 candidateReference 값을 그대로 사용한다.",
  };
}
