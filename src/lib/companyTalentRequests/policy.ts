function normalizeRelayContext(value: unknown) {
  return String(value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<\/?(?:system|assistant|user|tool|instruction)[^>]*>/gi, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

const SENSITIVE_QUESTION_PATTERNS = [
  /성별|남성|여성|인종|민족|결혼|임신|출산|가족|자녀|종교|정치|장애|질병|건강|병력|성적\s*지향|군필/i,
  /gender|sex\b|race|ethnicity|marital|pregnan|child|family|religion|politic|disabilit|medical|health|sexual\s+orientation|military\s+service/i,
];
export const COMPANY_TALENT_COMPENSATION_PATTERN =
  /연봉|급여|보상|희망\s*금액|salary|compensation|base\s*pay|total\s*comp|pay\s*(?:range|expectation)|₩|\$|만원|억원/i;

export function isCompensationQuestion(value: unknown) {
  return COMPANY_TALENT_COMPENSATION_PATTERN.test(normalizeRelayContext(value));
}

export function assertSafeProfessionalQuestion(value: unknown) {
  const context = normalizeRelayContext(value);
  if (!context) throw new Error("requestContext is required");
  if (SENSITIVE_QUESTION_PATTERNS.some((pattern) => pattern.test(context))) {
    throw new Error(
      "민감하거나 차별로 이어질 수 있는 질문은 대신 전달할 수 없습니다."
    );
  }
  return context;
}
