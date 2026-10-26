import { formatLlmDateTime } from '@/lib/llm/promptDateTime';
export type HiringBriefSnapshot = { request: string | null; criteria: unknown[] };
export type HiringBriefHistoryItem = {
  id: string; createdAt: string; actorLabel: string | null; source: string | null;
  summary: string | null; summaryStatus: string;
  before?: HiringBriefSnapshot; after?: HiringBriefSnapshot;
};
export type HiringBriefHistoryRead = { items: HiringBriefHistoryItem[]; total: number; nextOffset: number | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

// Structural subtraction only: no classifier decides which change matters.
// Unchanged criteria never enter the summary model, even after a reorder.
export function hiringBriefSummaryInput(before: HiringBriefSnapshot, after: HiringBriefSnapshot) {
  const changes: Record<string, unknown> = {};
  if (before.request !== after.request) changes.brief = { before: before.request, after: after.request };
  const remaining = [...after.criteria];
  const removed: unknown[] = [];
  for (const item of before.criteria) {
    const index = remaining.findIndex(other => canonical(item) === canonical(other));
    if (index >= 0) remaining.splice(index, 1);
    else removed.push(item);
  }
  if (removed.length || remaining.length) changes.criteria = { before: removed, after: remaining };
  else if (canonical(before.criteria) !== canonical(after.criteria)) changes.criteria = { orderChanged: true };
  return changes;
}

export function formatHiringBriefHistory(value: HiringBriefHistoryRead) {
  return [
    `매칭 기준(Hiring Brief + Criteria) 변경 이력 ${value.total}건; 이번 조회 ${value.items.length}건. 요약은 변경 설명이며 전후 스냅샷이 원본이다.`,
    ...value.items.map(item => [
      `${item.id} · ${formatLlmDateTime(item.createdAt)} · 수정자: ${item.actorLabel ?? '기록 없음'} · 경로: ${item.source ?? '기록 없음'}`,
      item.summary ?? `변경 요약 ${item.summaryStatus}; 상세 스냅샷은 hiringBriefHistory.historyId로 조회 가능.`,
      ...(item.before && item.after ? [
        `이전 Brief:\n${item.before.request ?? '(없음)'}`,
        `이전 Criteria:\n${item.before.criteria.map(c => JSON.stringify(c)).join('\n') || '(없음)'}`,
        `이후 Brief:\n${item.after.request ?? '(없음)'}`,
        `이후 Criteria:\n${item.after.criteria.map(c => JSON.stringify(c)).join('\n') || '(없음)'}`,
      ] : []),
    ].join('\n')),
    value.nextOffset === null ? '마지막 페이지.' : `다음 hiringBriefHistory.offset=${value.nextOffset}.`,
  ].join('\n\n').replaceAll('<','‹').replaceAll('>','›');
}
