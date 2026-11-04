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
