import { formatLlmDateTime, stringifyLlmDateTimes } from '@/lib/llm/promptDateTime';

export type ScheduledCandidate = {
  ref: string;
  talentId: string;
  name?: string;
  headline?: string;
  location?: unknown;
  joinedAt?: string | null;
  experiences?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  scores: { companyFit: number | null; candidateFit: number | null; mutualFit: number | null };
  criteria: Array<{ name: string; score: number | null; label: string | null }>;
  evaluatedStage: number | null;
  screening?: Record<string, string>;
  inputFingerprint: string | null;
  acceptedRecommendation?: { id: string; acceptedAt?: string } | null;
  recommendationHistory?: { company?: Array<Record<string, unknown>> };
  allowedLabels: string[];
};
export type ScheduledSelectionInput = {
  version: 'compact_selection_v1';
  roleId: string;
  briefVersion: string;
  ordinaryEligible: number;
  ordinaryShown: number;
  acceptedShown: number;
  limits: { companyFirst: number; talentFirst: number; acceptedConnect: number | null };
  candidates: ScheduledCandidate[];
};

/** This is the model's entire default candidate input, not a full-source loader. */
export function scheduledCandidateText(input: ScheduledSelectionInput) {
  const text = (value: unknown) => value == null || value === '' ? 'not recorded' : String(value);
  return [
    `Ordinary candidates: ${input.ordinaryShown} of ${input.ordinaryEligible}; accepted candidates separately: ${input.acceptedShown}.`,
    `Maximum NEW additions: company-first ${input.limits.companyFirst}, talent-first ${input.limits.talentFirst}. Accepted connections: ${input.limits.acceptedConnect ?? 'no numerical limit'}. These are ceilings, not targets.`,
    'The ordinary list is ordered solely by recorded mutualFit descending; ties use stable talent IDs. Employer, school and signup date receive no extra ranking weight. Accepted candidates are outside that ranking and the Top 50 limit.',
    'Scores are earlier Decisions assessments on a 0–100 ordinal scale, not hiring/acceptance probabilities or new decisions: companyFit = evidence against the company Hiring Brief; candidateFit = role against the person’s full Search Brief and soft Behavior Context; mutualFit = combined value with required/preferred tradeoffs, not the arithmetic average.',
    'Each criterion label is the most likely recorded category: conflict = documented contradiction; limited = documented shortfall; uncertain = absent/ambiguous evidence; good = direct support; excellent = unusually strong direct support. Scores average the probabilities of 0/25/50/75/100; never infer a category by rounding an axis score. Criteria definitions are in the current Role context once.',
    'Career entries below are the most recent five employment records and three education records. Work excerpts retain at most 240 source characters each. Omitted text is not evidence of absent experience. Private Brief/Behavior text, private messages, contact addresses and full profiles are not included. CandidateFit already reflects that private evidence; do not reconstruct private preferences or claim actual interest from the score.',
    ...input.candidates.map(row => {
      const history = row.recommendationHistory?.company ?? [];
      return [
        `\n${row.ref} | ${text(row.name)} | ${text(row.headline)} | location: ${text(row.location)} | joined: ${formatLlmDateTime(row.joinedAt).slice(0, 10)}`,
        `Allowed actions: ${row.allowedLabels.join(', ') || 'none now'}. ${row.acceptedRecommendation ? `Accepted this Role: ${formatLlmDateTime(row.acceptedRecommendation.acceptedAt)}; not yet introduced.` : 'Not in the accepted queue.'}`,
        `companyFit=${text(row.scores.companyFit)}; candidateFit=${text(row.scores.candidateFit)}; mutualFit=${text(row.scores.mutualFit)}; evaluated through stage ${text(row.evaluatedStage)}`,
        ...(row.evaluatedStage === 1 ? [`First-pass decisions (not a detailed score): ${stringifyLlmDateTimes(row.screening ?? {})}`] : []),
        `Criteria: ${row.criteria.map(c => `${c.name}: ${text(c.score)} (${text(c.label)})`).join('; ') || 'not recorded'}`,
        `Recent work: ${stringifyLlmDateTimes(row.experiences ?? [])}`,
        `Recent education: ${stringifyLlmDateTimes(row.education ?? [])}`,
        `Recommendation/response facts: ${history.length} records in this company; latest ${Math.min(5, history.length)}: ${stringifyLlmDateTimes(history.slice(-5).map(({ talent_id: _talent, ...event }) => event))}`,
      ].join('\n');
    }),
  ].join('\n');
}

/** Alias resolution and hard effect limits only; qualitative judgment stays in the LLM. */
export function scheduledRecommendationOptions(raw: unknown, input: ScheduledSelectionInput, sourceRunId: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Recommendation arguments must be an object');
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.actions)) throw Error('actions array required; [] records no action');
  const refs = new Map(input.candidates.map(candidate => [candidate.ref, candidate]));
  const selected = new Map<string, { talentId: string; route: string }>();
  const counts = { companyFirst: 0, talentFirst: 0, acceptedConnect: 0 };
  const reason = typeof value.reason === 'string' ? value.reason : '';
  for (const rawAction of value.actions) {
    const action = rawAction as { label?: string; talent_ids?: string[] } | null;
    if (!action || !['company_first', 'talent_first', 'connect'].includes(action.label ?? '') || !Array.isArray(action.talent_ids))
      throw Error('Each action needs label and talent_ids');
    const label = action.label!;
    for (const ref of action.talent_ids) {
      const candidate = refs.get(ref);
      if (!candidate || !candidate.allowedLabels.includes(label)) throw Error(`Unknown or unauthorized candidate/action: ${ref}`);
      if (!candidate.inputFingerprint) throw Error(`Current evaluation unavailable: ${ref}`);
      const route = label === 'talent_first' ? 'candidate_first' : label;
      const previous = selected.get(candidate.talentId);
      if (previous && (previous.route === route || previous.route === 'both' || previous.route === 'connect' || route === 'connect'))
        throw Error(`Duplicate or conflicting action: ${ref}`);
      selected.set(candidate.talentId, { talentId: candidate.talentId, route: previous ? 'both' : route });
      counts[label === 'company_first' ? 'companyFirst' : label === 'talent_first' ? 'talentFirst' : 'acceptedConnect']++;
    }
  }
  for (const key of ['companyFirst', 'talentFirst', 'acceptedConnect'] as const) {
    const limit = input.limits[key];
    if (limit !== null && counts[key] > limit) throw Error(`Selection exceeds ${key} capacity`);
  }
  return { roleId: input.roleId, scope: 'evaluated', startStage: 1, limit: Math.max(1, selected.size),
    recommendCount: selected.size ? Math.max(1, counts.companyFirst + counts.talentFirst) : 0,
    recommendCounts: { companyFirst: counts.companyFirst, talentFirst: counts.talentFirst },
    selectionSourceRunId: sourceRunId, selections: [...selected.values()], reason };
}
