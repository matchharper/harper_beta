export const OPENAI_REALTIME_MODEL = "gpt-4o-mini-realtime-preview";
export const OPENAI_KEY = "";
export const ELEVENLABS_VOICE_ID = "";
export const ELEVENLABS_API_KEY = "";

export const MIN_CREDITS_FOR_SEARCH = 10;

export const NO_RESULT_MESSAGES = [
  "검색 결과를 찾을 수 없습니다. 다른 관점에서 다시 시도해볼까요?",
  "요청을 완벽하게 처리하지 못했어요. 다른 검색 방식으로 다시 시도해볼까요?",
  "결과를 가져오는 데 문제가 발생했습니다. 한 번 더 검색해볼까요?",
];

export const LESS_RESULT_MESSAGES = [
  "좋은 출발점이 될 만한 결과이긴 하지만, 목록이 다소 적어요. 더 많은 후보자를 찾기 위해 범위를 넓혀볼까요?",
  "조건을 조금 넓히면 더 많은 후보를 찾을 수 있어요.",
  "해당 쿼리에 정확히 맞는 프로필을 더 찾지 못했어요. 조건을 조금 다르게 해서 추가로 검색해볼까요?",
];

export function getRandomNoResultMessage(): string {
  const idx = Math.floor(Math.random() * NO_RESULT_MESSAGES.length);
  return NO_RESULT_MESSAGES[idx];
}

export function getRandomLessResultMessage(): string {
  const idx = Math.floor(Math.random() * LESS_RESULT_MESSAGES.length);
  return LESS_RESULT_MESSAGES[idx];
}
