import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, COMPANY_AGENT_SERVICE_CAPABILITIES } from "@/lib/org/agent/capabilities/registry";
import type { AgentContactSource } from "./contracts";

export type CompanyAgentScope = Extract<
  AgentContactSource,
  { kind: "company_event" }
> & {
  assertCurrent: () => Promise<void>;
  /** Company-wide memory is read for judgment only in runs that answer to the
   * company (criteria review, schedules), never in correspondence with a
   * candidate's agent. */
  companyMemory?: boolean;
};
// The receiver and dynamically loaded tools can load separate module instances
// (ESM/CJS or server chunks). Carry the capability on the client, not in a
// module-local WeakMap; forwarding client proxies preserve it as well.
const scopeKey = Symbol.for("harper.companyAgentScope");

function withMark<T extends object>(admin: T, key: symbol, value: unknown): T {
  return new Proxy(admin, {
    get(target, property) {
      if (property === key) return value;
      const current = Reflect.get(target, property, target);
      return typeof current === "function" ? current.bind(target) : current;
    },
  });
}

/** Server-created capability. No user ID, email bypass or request field grants it. */
export function withCompanyAgentScope<T extends object>(
  admin: T,
  scope: CompanyAgentScope
): T {
  return withMark(admin, scopeKey, scope);
}
const candidateFacingKey = Symbol.for("harper.companyAgentCandidateFacing");

/** Set where a run is created: member-scoped runs have no service scope to carry this. */
export function withCandidateFacingRun<T extends object>(admin: T): T {
  return withMark(admin, candidateFacingKey, true);
}

/** The run types that can contact a candidate. One list for every run creator. */
export function companyRunCanContactCandidate(run: {
  actionName: string;
  schedule?: { effect_tier?: unknown; target_refs?: { introductionRootId?: unknown } | null } | null;
}) {
  if (run.actionName === "agent_contact_received" || run.actionName === "candidate_contact_received") return true;
  if (run.actionName !== "agent_schedule_due" || !run.schedule) return false;
  return Boolean(run.schedule.target_refs?.introductionRootId) || Number(run.schedule.effect_tier ?? 0) >= 2;
}

export function companyAgentScope(admin: object) {
  return (admin as { [scopeKey]?: CompanyAgentScope })[scopeKey];
}
/** True only for a service run that was given company-wide memory reads. */
export function companyAgentReadsCompanyMemory(admin: object) {
  return companyAgentScope(admin)?.companyMemory === true;
}

/** True in a run that can contact a candidate: it may know that a decision happened, not why; company notes stay out. */
export function companyAgentIsCorrespondence(admin: object) {
  if ((admin as { [candidateFacingKey]?: boolean })[candidateFacingKey] === true) return true;
  const scope = companyAgentScope(admin);
  return scope !== undefined && scope.companyMemory !== true;
}

/** Service principals can inspect their Role, research public evidence and act on
 * existing correspondence. Membership-only hiring mutations remain unavailable.
 * Use the shared capability registry; the receiver has no separate tool catalog.
 */
export function companyAgentServiceTools(): ReadonlySet<string> {
  return new Set([
    ...COMPANY_BASE_TOOLS,
    ...COMPANY_CAPABILITIES.filter(capability =>
      (COMPANY_AGENT_SERVICE_CAPABILITIES as readonly string[]).includes(capability.id)
    ).flatMap(capability => [...capability.toolIds]),
  ]);
}

/** Agent correspondence runs: every service tool except Harper's own suggestions
 * (the review's criteria suggestion and To-do suggestions from its schedules). */
export function companyAgentCorrespondenceTools(): ReadonlySet<string> {
  const tools = new Set(companyAgentServiceTools());
  tools.delete("propose_criteria_change");
  tools.delete("manage_todo_suggestions");
  return tools;
}

export function formatCompanyAgentServiceScope(scope: Pick<CompanyAgentScope, "roleId" | "companyMemory">, candidateFacing = false) {
  const base = `회사 에이전트의 서비스 실행입니다. 팀원 계정의 지시나 권한 위임을 가장하지 않습니다. 접근은 역할 ${scope.roleId}의 승인된 자료와 연락으로 제한됩니다. 채용 결정·결제·팀원 관리 권한은 없습니다.`;
  const memory = scope.companyMemory === true
    ? `\n회사 전체(scope=company) 메모리와 회사 공용 메모${candidateFacing ? "" : ", 회사의 결정 이유(decisions)"}는 판단에만 씁니다. 이 실행의 글을 받는 사람은 그 내용을 볼 수 없을 수 있으니 그대로 인용하거나 옮겨 적지 않습니다.`
    : "";
  return `${base}${memory}${candidateFacing ? "\n이 실행은 후보자 쪽에 연락할 수 있어 회사의 결정 이유와 후보자 메모는 읽을 수 없고, 결정이 있었다는 사실(decisions)만 읽습니다." : ""}`;
}
