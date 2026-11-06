import { COMPANY_BASE_TOOLS, COMPANY_CAPABILITIES, COMPANY_AGENT_SERVICE_CAPABILITIES } from "@/lib/org/agent/capabilities/registry";
import type { AgentContactSource } from "./contracts";

export type CompanyAgentScope = Extract<
  AgentContactSource,
  { kind: "company_event" }
> & {
  assertCurrent: () => Promise<void>;
};
// The receiver and dynamically loaded tools can load separate module instances
// (ESM/CJS or server chunks). Carry the capability on the client, not in a
// module-local WeakMap; forwarding client proxies preserve it as well.
const scopeKey = Symbol.for("harper.companyAgentScope");

/** Server-created capability. No user ID, email bypass or request field grants it. */
export function withCompanyAgentScope<T extends object>(
  admin: T,
  scope: CompanyAgentScope
): T {
  return new Proxy(admin, {
    get(target, property) {
      if (property === scopeKey) return scope;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
export function companyAgentScope(admin: object) {
  return (admin as { [scopeKey]?: CompanyAgentScope })[scopeKey];
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

/** Agent correspondence runs: every service tool except the review's criteria suggestion. */
export function companyAgentCorrespondenceTools(): ReadonlySet<string> {
  const tools = new Set(companyAgentServiceTools());
  tools.delete("propose_criteria_change");
  return tools;
}

export function formatCompanyAgentServiceScope(scope: Pick<CompanyAgentScope, "roleId">) {
  return `회사 에이전트의 서비스 실행입니다. 팀원 계정의 지시나 권한 위임을 가장하지 않습니다. 접근은 역할 ${scope.roleId}의 승인된 자료와 연락으로 제한됩니다. 채용 결정·결제·팀원 관리 권한은 없습니다.`;
}
