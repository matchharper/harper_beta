import { createHash } from 'node:crypto';
import { formatLlmDateTime, projectLlmDateTimes } from '@/lib/llm/promptDateTime';
import { publicationSystem } from './prompt.generated';

export type Facts = Record<string, any>;
export type PublicationCandidate = {
  talentId: string; profile: Facts; searchBrief: Facts[]; assessment: Facts;
  evaluationId: string; sourceFingerprint: string;
};
export type PublicationRole = {
  roleId: string; name: string; description: string; hiringBrief: string;
  companyBehavior: string; salary: string; criteria: {name: string; criteria: string}[];
  outputLanguage: string;
};
export type Presentation = {
  tldr: string; harperNote: string;
  criteriaEvaluations: Facts[]; finalFit: null; fingerprint: string; usage: Facts;
};
export const PRESENTATION_MODEL = 'gpt-6-luna';
export const PRESENTATION_REASONING = 'high';
// run_requested overrides the scheduled writer's 16384-token default.
export const PRESENTATION_MAX_OUTPUT_TOKENS = 128000;
export function fingerprint(value: unknown): string {
  const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === 'object' && !(item instanceof Date)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

// The Worker evidence layout is retained; timestamps use the web's common formatter.
function display(value: unknown): string {
  if (value === null || value === undefined) return '미제공';
  if (value === '') return '(빈 값)';
  if (value instanceof Date) return formatLlmDateTime(value);
  return String(value);
}
export function evidence(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return value.length ? value.map((item, index) =>
    item !== null && typeof item === 'object'
      ? `${pad}${index + 1}.\n${evidence(item, indent + 3)}`
      : `${pad}${index + 1}. ${display(item).replaceAll('\n', `\n${pad}   `)}`).join('\n') : `${pad}(항목 없음)`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // Format timestamp metadata, never rewrite user-authored content or identifiers.
    const entries = Object.entries(projectLlmDateTimes(value) as Facts);
    return entries.length ? entries.map(([key, item]) => item !== null && typeof item === 'object' && !(item instanceof Date)
      ? `${pad}- ${key}:\n${evidence(item, indent + 2)}`
      : `${pad}- ${key}: ${display(item).replaceAll('\n', `\n${pad}  `)}`).join('\n') : `${pad}(항목 없음)`;
  }
  return display(value).split('\n').map(line => pad + line).join('\n');
}
export function profileText(profile: Facts): string {
  return Object.entries(profile).map(([key, value]) => {
    if (key === 'profile') return evidence(value);
    if (['experiences', 'educations'].includes(key) && Array.isArray(value)) {
      const items = value.map((entry: Facts, index: number) => {
        const {startDate, endDate, ...facts} = projectLlmDateTimes(entry) as Facts;
        return `${index + 1}. 기간: ${display(startDate)} → ${display(endDate)}\n${evidence(facts, 3)}`;
      });
      return `#### ${key === 'experiences' ? '경력 (종료일 미제공은 현재 재직의 확인이 아님)' : '학력'}\n${items.join('\n') || '(항목 없음)'}`;
    }
    return evidence({[key]: value});
  }).join('\n\n');
}
export function presentationInput(role: PublicationRole, candidate: PublicationCandidate, now = new Date()) {
  const criteria = Object.fromEntries(role.criteria.map((criterion, index) => [`c${index + 1}`, criterion]));
  const scores = new Map<string, Facts>((candidate.assessment.criteria ?? []).map((row: Facts) => [row.name, row]));
  const payload = {
    '회사 공유용 Profile': profileText(candidate.profile),
    '역할·회사 정보': Object.fromEntries(Object.entries({name: role.name, description: role.description,
      hiringBrief: role.hiringBrief, companyBehavior: role.companyBehavior, salary: role.salary}).filter(([,value]) => value)),
    '현재 회사 평가 기준 (criterionRef별)': criteria,
    searchBrief: candidate.searchBrief,
    criterionScores: Object.entries(criteria).filter(([,criterion]) => scores.has(criterion.name)).map(([ref, criterion]) => {
      const score = scores.get(criterion.name)!;
      return {criterionRef: ref, ...Object.fromEntries(['score', 'label'].filter(key => key in score).map(key => [key, score[key]]))};
    }),
    outputLanguage: role.outputLanguage,
  };
  return {system: publicationSystem(scores.size > 0), user: Object.entries(payload)
    .map(([title, value]) => `## ${title}\n${evidence(value)}`)
    .concat(`## 기준 날짜\n${formatLlmDateTime(now).slice(0, 10)} (Asia/Seoul)`).join('\n\n')};
}
export function parsePresentation(raw: Facts, role: PublicationRole, candidate: PublicationCandidate) {
  if (!raw || typeof raw.tldr !== 'string' || typeof raw.harper_note !== 'string'
    || !Array.isArray(raw.criteriaEvaluations))
    throw new Error('Candidate presentation has an invalid output structure');
  const refs = new Map<string, Facts>();
  for (const item of raw.criteriaEvaluations) {
    if (!item || typeof item.criterionRef !== 'string' || typeof item.content !== 'string' || refs.has(item.criterionRef))
      throw new Error('Candidate presentation has invalid or duplicate criterion references');
    refs.set(item.criterionRef, item);
  }
  if (refs.size !== role.criteria.length || role.criteria.some((_, i) => !refs.has(`c${i + 1}`)))
    throw new Error('Candidate presentation does not cover the supplied criteria');
  return {tldr: raw.tldr, harperNote: raw.harper_note,
    finalFit: null, criteriaEvaluations: role.criteria.map((criterion, index) => {
      const score = (candidate.assessment.criteria ?? []).find((item: Facts) => item.name === criterion.name) ?? {};
      return {name: criterion.name, fitness: score.label ?? 'uncertain', content: refs.get(`c${index + 1}`)!.content,
        criterionDefinition: criterion.criteria,
        ...Object.fromEntries(['score', 'label', 'distribution'].filter(key => key in score).map(key => [key, score[key]]))};
    })};
}
export const presentationSchema = {
  type: 'object', additionalProperties: false, required: ['tldr','harper_note','criteriaEvaluations'],
  properties: {tldr: {type: 'string'}, harper_note: {type: 'string'},
    criteriaEvaluations: {type: 'array', items: {type: 'object', additionalProperties: false,
      required: ['criterionRef','content'], properties: {criterionRef: {type: 'string'}, content: {type: 'string'}}}}},
};
