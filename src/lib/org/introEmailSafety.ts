const PROCESS_HISTORY_PATTERNS = [
  /\bdeclin(?:e|ed|ing)\b/i,
  /\breject(?:ed|ion|ing)?\b/i,
  /\bclos(?:e|ed|ure)\b[^\n]{0,40}\b(?:process|notice|connection)\b/i,
  /\bstopp?ed\s+(?:the\s+)?process\b/i,
  /\bre(?:activation|activated|consideration|considered)\b/i,
  /\breversal\b/i,
  /\bchanged\s+(?:our|their|the)\s+mind\b/i,
  /거절|불합격|종료\s*안내|프로세스\s*(?:종료|중단)|재연결|다시\s*연결|번복|재고/,
];

export function containsOrgIntroProcessHistory(value: string) {
  return PROCESS_HISTORY_PATTERNS.some((pattern) => pattern.test(value));
}
