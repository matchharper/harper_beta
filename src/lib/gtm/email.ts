/** Convert only legacy plain text. Existing HTML remains the reviewed source. */
export function emailBodyToHtml(value: string) {
  if (/<\/?[a-z][^>]*>/i.test(value)) return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export const mailStatusLabels: Record<string, string> = {
  ready_for_review: "검토 대기",
  needs_revision: "수정 요청",
  approved: "발송 대기",
  sending: "발송 중",
  sent: "발송 완료",
  replied: "답장 도착",
  failed: "발송 실패",
  skipped: "발송 제외",
};
